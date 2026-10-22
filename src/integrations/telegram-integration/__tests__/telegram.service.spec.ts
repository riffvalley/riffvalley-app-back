import { Logger } from '@nestjs/common';
import { TelegramService } from '../telegram.service';

describe('TelegramService public HTML client', () => {
  const originalFetch = global.fetch;
  let service: TelegramService;
  let fetchMock: jest.Mock;

  const message = (
    id: string,
    date: string,
    text: string,
    photos: string[] = [],
  ) => `
    <div class="tgme_widget_message_wrap">
      <div class="tgme_widget_message" data-post="conciertosrockmetal/${id}">
        <div class="tgme_widget_message_text">${text}</div>
        ${photos
          .map(
            (url) =>
              `<div class="tgme_widget_message_photo_wrap" style="background-image:url('${url}')"></div>`,
          )
          .join('')}
        <a class="tgme_widget_message_date"><time datetime="${date}"></time></a>
      </div>
    </div>
  `;

  beforeEach(() => {
    service = new TelegramService();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('parses public channel HTML, album photos and chronological order', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: jest
        .fn()
        .mockResolvedValue(
          message('100', '2026-10-12T10:00:00Z', 'Older post', [
            'https://cdn.test/old.jpg',
          ]) +
            message('101', '2026-10-13T10:00:00Z', ' Newer post ', [
              'https://cdn.test/one.jpg',
              'https://cdn.test/two.jpg',
            ]),
        ),
    });

    await expect(
      service.getChannelPosts('conciertosrockmetal', 6),
    ).resolves.toEqual([
      {
        id: '101',
        text: 'Newer post',
        image: 'https://cdn.test/one.jpg',
        images: ['https://cdn.test/one.jpg', 'https://cdn.test/two.jpg'],
        date: '2026-10-13T10:00:00Z',
        link: 'https://t.me/conciertosrockmetal/101',
      },
      {
        id: '100',
        text: 'Older post',
        image: 'https://cdn.test/old.jpg',
        images: ['https://cdn.test/old.jpg'],
        date: '2026-10-12T10:00:00Z',
        link: 'https://t.me/conciertosrockmetal/100',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://t.me/s/conciertosrockmetal',
    );
  });

  it.each([
    ['empty HTML', ''],
    [
      'unexpected HTML structure',
      '<div class="tgme_widget_message_wrap"><span>Changed markup</span></div>',
    ],
  ])('returns no posts for %s', async (_label, html) => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(html),
    });

    await expect(service.getChannelPosts('channel', 6)).resolves.toEqual([]);
  });

  it('caches provider pages for fifteen minutes and applies each caller limit', async () => {
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    fetchMock.mockResolvedValue({
      ok: true,
      text: jest
        .fn()
        .mockResolvedValue(
          message('100', '2026-10-12T10:00:00Z', 'One') +
            message('101', '2026-10-13T10:00:00Z', 'Two'),
        ),
    });

    await expect(service.getChannelPosts('channel', 1)).resolves.toHaveLength(
      1,
    );
    await expect(service.getChannelPosts('channel', 2)).resolves.toHaveLength(
      2,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now += 15 * 60 * 1000;
    await service.getChannelPosts('channel', 2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses Telegram before cursors and returns the existing page metadata', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: jest
        .fn()
        .mockResolvedValue(
          message('104', '2026-10-14T10:00:00Z', 'Four') +
            message('103', '2026-10-13T10:00:00Z', 'Three'),
        ),
    });

    const page = await service.getChannelPostsPage('channel', 1, '105');

    expect(fetchMock).toHaveBeenCalledWith('https://t.me/s/channel?before=105');
    expect(page).toMatchObject({
      data: [expect.objectContaining({ id: '104', text: 'Four' })],
      nextBefore: '104',
      hasMore: true,
    });
  });

  it('keeps empty fallbacks for HTTP failures and inaccessible pages', async () => {
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await expect(service.getChannelPosts('channel', 6)).resolves.toEqual([]);
    await expect(
      service.getChannelPostsPage('channel', 13, '105'),
    ).resolves.toEqual({ data: [], nextBefore: null, hasMore: false });

    fetchMock.mockRejectedValue(new Error('unreachable'));
    await expect(service.getChannelPosts('other-channel', 6)).resolves.toEqual(
      [],
    );
    await expect(
      service.getChannelPostsPage('other-channel', 13),
    ).resolves.toEqual({ data: [], nextBefore: null, hasMore: false });
    expect(logger).toHaveBeenCalledWith(
      'Failed to fetch Telegram channel: 503',
    );
    expect(logger).toHaveBeenCalledWith(
      'Failed to fetch Telegram channel page: 503',
    );
    expect(logger).toHaveBeenCalledWith(
      'Error fetching Telegram channel: unreachable',
    );
    expect(logger).toHaveBeenCalledWith(
      'Error fetching Telegram channel page: unreachable',
    );
  });
});
