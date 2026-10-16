import {
  buildBestDiscsPostContent,
  buildPostContent,
} from '../list-gutenberg-builder';

const featuredDiscId = '11111111-1111-4111-8111-111111111111';
const inboxDiscId = '22222222-2222-4222-8222-222222222222';
const secondGroupDiscId = '33333333-3333-4333-8333-333333333333';

const featuredAsignation = {
  id: 'asignation-featured',
  genre: 'post-hardcore',
  similarBands: 'Banda B, Banda C',
  description: '<p>Primer &amp; párrafo</p><p>Segundo <em>párrafo</em></p>',
  user: { username: 'tottibero' },
  disc: {
    id: featuredDiscId,
    name: 'Álbum <Uno>',
    artist: { name: 'Bánda & Sons' },
    image: 'https://images.test/portada.jpg',
    debut: true,
    description: 'Descripción del disco',
  },
};

const inboxAsignation = {
  id: 'asignation-inbox',
  genre: null,
  similarBands: null,
  description: '',
  user: { username: 'writer_name' },
  disc: {
    id: inboxDiscId,
    name: 'Sin portada',
    artist: { name: 'Artista Ñ' },
    image: null,
    debut: false,
    description: '',
  },
};

const anotherGroupAsignation = {
  id: 'asignation-second-group',
  genre: 'metal',
  similarBands: 'Grupo D',
  description: '<p>Descripción grupo dos</p>',
  user: { username: 'editor' },
  disc: {
    id: secondGroupDiscId,
    name: 'Disco II',
    artist: { name: 'Grupo E' },
    image: 'https://images.test/disco-ii.jpg',
    debut: false,
    description: 'Detalle',
  },
};

describe('List Gutenberg builder characterization', () => {
  it('preserves the HTML for several weekly Radar groups and fallbacks', () => {
    const list = { releaseDate: new Date(2026, 8, 18) };

    const groups = [
      buildPostContent(
        [featuredAsignation, inboxAsignation],
        1,
        list,
        'Nuevos discos - 18/09/2026 (I)',
        ['radar-track-one', null],
      ),
      buildPostContent(
        [anotherGroupAsignation],
        2,
        list,
        'Nuevos discos - 18/09/2026 (II)',
        [null],
      ),
    ];

    expect(groups).toMatchSnapshot();
  });

  it('preserves the monthly Mejores HTML, authors, paragraphs, tracks and footer', () => {
    const content = buildBestDiscsPostContent(
      [featuredAsignation, inboxAsignation],
      'septiembre',
      2026,
      ['monthly-track-one', null],
      [{ name: 'Autora & Co', link: 'https://wp.test/author/autora' }, null],
    );

    expect(content).toMatchSnapshot();
  });
});
