export const FOOTER_MARKER_CLASS = 'rv-generated-footer';

export type GutenbergDiscAssignment = {
  description?: string | null;
  genre?: string | null;
  similarBands?: string | null;
  user?: { username?: string | null } | null;
  disc?: {
    id: string;
    name?: string | null;
    artist?: { name?: string | null } | null;
    image?: string | null;
    debut?: boolean | null;
    description?: string | null;
  } | null;
};

export type PublishableGutenbergDiscAssignment = GutenbergDiscAssignment & {
  disc: NonNullable<GutenbergDiscAssignment['disc']>;
  position?: number | null;
  spotifyTrackId?: string | null;
};

export type GutenbergAuthor = { name: string; link: string } | null;

export function buildPostContent(
  discs: GutenbergDiscAssignment[],
  position: number,
  list: { releaseDate?: Date | string | null },
  title = '',
  spotifyTrackIds: (string | null)[] = [],
): string {
  const ordinals = ['Primera', 'Segunda', 'Tercera', 'Cuarta', 'Quinta'];
  const ordinal = ordinals[position - 1] ?? `${position}ª`;

  const rawReleaseDate = list.releaseDate
    ? new Date(list.releaseDate)
    : new Date();
  // Music releases happen on Fridays — always use the Friday of the release week
  const releaseDate = new Date(rawReleaseDate);
  const daysSinceFriday = (rawReleaseDate.getDay() + 2) % 7; // Fri=0, Sat=1, Sun=2, Mon=3...
  releaseDate.setDate(releaseDate.getDate() - daysSinceFriday);
  const day = releaseDate.getDate().toString().padStart(2, '0');
  const month = (releaseDate.getMonth() + 1).toString().padStart(2, '0');
  const year = releaseDate.getFullYear();
  const dateStr = `${day}/${month}/${year}`;

  const artistNames = discs.map((a) => a.disc?.artist?.name ?? '');
  const artistNamesBold = artistNames.map((name) => `<strong>${name}</strong>`);
  const artistNamesHtml =
    artistNamesBold.length > 1
      ? `${artistNamesBold.slice(0, -1).join(', ')} y ${artistNamesBold[artistNamesBold.length - 1]}`
      : (artistNamesBold[0] ?? '');

  const intro = `<!-- wp:spacer {"height":"7px"} -->
<div style="height:7px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify">Nuevos discos del ${dateStr}: ${ordinal} entrega de novedades de esta semana. Hoy os hablamos de ${discs.length} lanzamientos: ${artistNamesHtml}.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify">No olvides contarnos en nuestras <a href="https://www.instagram.com/riffvalleyes/" target="_blank" rel="noreferrer noopener">redes sociales</a> qué os han parecido estas bandas.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify">Si quieres saber qué otros discos han sido lanzados esta semana, no dudes en echarle un ojo a nuestra <a href="https://www.riffvalley.es/novedades/discos-metal-rock-hardcore-2025">guía de lanzamientos de 2026</a>. Y, si además quieres votarlos y poder filtrarlos por género, país o tus propios gustos, te recomendamos usar <a href="http://app.riffvalley.es/login" target="_blank" rel="noreferrer noopener">nuestra app</a> de forma gratuita.</p>
<!-- /wp:paragraph -->

<!-- wp:spacer {"height":"20px"} -->
<div style="height:20px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->

<!-- wp:heading {"level":2,"className":"wp-block-heading"} -->
<h2 class="wp-block-heading" id="los-mejores-discos-lanzados-esta-semana-son"><strong>Los nuevos discos lanzados esta semana:</strong></h2>
<!-- /wp:heading -->

<!-- wp:spacer {"height":"20px"} -->
<div style="height:20px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->`;

  const discSections = buildWeeklyDiscSections(discs, spotifyTrackIds, title);

  return `${intro}\n\n${discSections}\n\n${buildSocialFooter()}`;
}

// Igual que buildDiscSections, pero para el post semanal de "nuevos
// discos": conserva el estilo visual propio de ese post (imagen 300px vía
// wp:html, sin línea "Recomendado por") y solo añade el mismo envoltorio
// rv-disc-<discId> para poder localizar y sustituir el bloque de un disco
// suelto (ver replaceDiscSection / syncDiscToWordPress).
export function buildWeeklyDiscSections(
  discs: GutenbergDiscAssignment[],
  spotifyTrackIds: (string | null)[],
  title: string,
): string {
  const FALLBACK_TRACK_ID = '75EVwxItVYmK59hhfSsBoD';

  return discs
    .map((a, i) => {
      const artist = a.disc?.artist?.name ?? '';
      const discName = a.disc?.name ?? '';
      // Texto libre (Asignation.genre), no el genre estructurado del
      // disco: se rellena a mano por asignación, igual que similarBands.
      const genre = a.genre || 'xx';
      const image = a.disc?.image ?? '';
      const debut = a.disc?.debut ? ' <em>(Debut)</em>' : '';
      const description = a.disc?.description ?? '';

      let imageBlock = '';
      if (image) {
        const altText = `${artist} - ${discName} | ${title}`;
        imageBlock = `\n\n<!-- wp:html -->
<div class="wp-block-image is-style-zoooom">
<figure class="alignright size-large is-resized"><img decoding="async" src="${image}" alt="${altText}" style="aspect-ratio:1;object-fit:cover;width:300px"/></figure>
</div>
<!-- /wp:html -->`;
      }

      const trackId = spotifyTrackIds[i] ?? FALLBACK_TRACK_ID;
      const spotifyEmbed = `\n\n<!-- wp:html -->
<iframe data-testid="embed-iframe" style="border-radius:12px" src="https://open.spotify.com/embed/track/${trackId}?utm_source=generator" width="100%" height="152" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
<!-- /wp:html -->`;

      const descriptionText = description ? ` ${description}` : '';
      const username = a.user?.username ?? '';

      const richParagraphs = extractParagraphs(a.description);
      const firstParagraph = richParagraphs.length
        ? richParagraphs[0]
        : `${username}${descriptionText}`;
      const extraParagraphBlocks = buildExtraParagraphBlocks(
        richParagraphs.slice(1),
      );

      return `<!-- wp:group {"className":"rv-disc-${a.disc.id}"} -->
<div class="wp-block-group rv-disc-${a.disc.id}">${imageBlock}

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify"><strong>${artist} &#8211; <em>${discName}</em>${debut}:</strong> ${firstParagraph}</p>
<!-- /wp:paragraph -->${extraParagraphBlocks}

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify"><strong>Género: </strong>${genre}</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify"><strong>Bandas similares:</strong> ${a.similarBands || 'xx, xx, xx'}</p>
<!-- /wp:paragraph -->${spotifyEmbed}

<!-- wp:spacer {"height":"20px"} -->
<div style="height:20px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->
</div>
<!-- /wp:group -->`;
    })
    .join('\n\n');
}

export function extractParagraphs(html?: string | null): string[] {
  if (!html) return [];
  const matches = html.match(/<p[^>]*>[\s\S]*?<\/p>/gi);
  const paragraphs = matches?.length
    ? matches.map((p) =>
        p
          .replace(/^<p[^>]*>/i, '')
          .replace(/<\/p>$/i, '')
          .trim(),
      )
    : [html.trim()];
  return paragraphs.filter((p) => p.length > 0);
}

export function buildExtraParagraphBlocks(paragraphs: string[]): string {
  if (!paragraphs.length) return '';
  const blocks = paragraphs
    .map(
      (p) => `<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify">${p}</p>
<!-- /wp:paragraph -->`,
    )
    .join('\n\n');
  return `\n\n${blocks}`;
}

export function buildBestDiscsPostContent(
  discs: GutenbergDiscAssignment[],
  monthName: string,
  year: number,
  spotifyTrackIds: (string | null)[],
  authors: GutenbergAuthor[],
): string {
  const artistNames = discs.map((a) => a.disc?.artist?.name ?? '');
  const artistNamesBold = artistNames.map((name) => `<strong>${name}</strong>`);
  const artistNamesHtml =
    artistNamesBold.length > 1
      ? `${artistNamesBold.slice(0, -1).join(', ')} y ${artistNamesBold[artistNamesBold.length - 1]}`
      : (artistNamesBold[0] ?? '');

  const intro = `<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify">Aquí os traemos los mejores discos que se han publicado en el <strong>mes de ${monthName} de ${year}</strong>. Os hablaremos de los nuevos trabajos de ${artistNamesHtml}.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>📱 <strong>Descubre todos estos discos (y muchos más) en la <a href="https://app.riffvalley.es/login" target="_blank" rel="noreferrer noopener">app de <em>Riff Valley</em></a></strong>: filtra por género o país, escucha novedades al momento, vota tus favoritos (incluyendo su portada) y sigue en directo cómo evolucionan los rankings, con acceso directo a <em>Spotify </em>y otras plataformas.</p>
<!-- /wp:paragraph -->

<!-- wp:spacer {"height":"20px"} -->
<div style="height:20px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Los mejores discos del mes de <strong>${monthName}</strong> de ${year} son:</h3>
<!-- /wp:heading -->

<!-- wp:spacer {"height":"20px"} -->
<div style="height:20px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->`;

  const discSections = buildDiscSections(discs, spotifyTrackIds, authors);

  return `${intro}\n\n${discSections}\n\n${buildSocialFooter()}`;
}

export function buildDiscSections(
  discs: GutenbergDiscAssignment[],
  spotifyTrackIds: (string | null)[],
  authors: GutenbergAuthor[],
): string {
  const FALLBACK_TRACK_ID = '75EVwxItVYmK59hhfSsBoD';

  return discs
    .map((a, i) => {
      const artist = a.disc?.artist?.name ?? '';
      const discName = a.disc?.name ?? '';
      // Texto libre (Asignation.genre), no el genre estructurado del
      // disco: se rellena a mano por asignación, igual que similarBands.
      const genre = a.genre || 'xx';
      const image = a.disc?.image ?? '';
      const debut = a.disc?.debut ? ' <em>(Debut)</em>' : '';
      const description = a.disc?.description ?? '';

      let imageBlock = '';
      if (image) {
        const altText = `${artist} - ${discName}`;
        imageBlock = `\n\n<!-- wp:image {"width":"250px","aspectRatio":"1","scale":"cover","sizeSlug":"large","linkDestination":"none","align":"right","className":"is-style-zoooom"} -->
<figure class="wp-block-image alignright size-large is-resized is-style-zoooom"><img src="${image}" alt="${altText}" style="aspect-ratio:1;object-fit:cover;width:250px"/></figure>
<!-- /wp:image -->`;
      }

      const trackId = spotifyTrackIds[i] ?? FALLBACK_TRACK_ID;
      const spotifyEmbed = `\n\n<!-- wp:html -->
<iframe data-testid="embed-iframe" style="border-radius:12px" src="https://open.spotify.com/embed/track/${trackId}?utm_source=generator" width="100%" height="152" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
<!-- /wp:html -->`;

      const author = authors[i];
      const recommendedBy = author
        ? `<a href="${author.link}" target="_blank" rel="noreferrer noopener">${author.name}</a>`
        : (a.user?.username ?? '');

      const richParagraphs = extractParagraphs(a.description);
      const firstParagraph = richParagraphs.length
        ? richParagraphs[0]
        : description;
      const extraParagraphBlocks = buildExtraParagraphBlocks(
        richParagraphs.slice(1),
      );

      // Envolvemos todo el disco en un wp:group con la clase
      // rv-disc-<discId>: así el bloque tiene un inicio y un final
      // inequívocos que nos permiten localizarlo y sustituirlo entero
      // más adelante si el texto se edita, sin tocar el resto del post.
      return `<!-- wp:group {"className":"rv-disc-${a.disc.id}"} -->
<div class="wp-block-group rv-disc-${a.disc.id}">${imageBlock}

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify"><strong>${artist} &#8211; <em>${discName}</em>${debut}:</strong> ${firstParagraph}</p>
<!-- /wp:paragraph -->${extraParagraphBlocks}

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify"><strong>Género: </strong>${genre}</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify"><strong>Bandas similares:</strong> ${a.similarBands || 'xx, xx, xx'}</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify"><strong>Recomendado por</strong> ${recommendedBy}</p>
<!-- /wp:paragraph -->${spotifyEmbed}

<!-- wp:spacer {"height":"20px"} -->
<div style="height:20px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->
</div>
<!-- /wp:group -->`;
    })
    .join('\n\n');
}

export function buildSocialFooter(): string {
  return `<!-- wp:separator {"className":"is-style-wide ${FOOTER_MARKER_CLASS}","opacity":"css"} -->
<hr class="wp-block-separator has-css-opacity is-style-wide ${FOOTER_MARKER_CLASS}"/>
<!-- /wp:separator -->

<!-- wp:spacer {"height":"20px"} -->
<div style="height:20px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify">¡Muchas gracias por leer este artículo! ¿Qué os han parecido estos nuevos discos? ¿Nos hemos dejado <strong>algún disco imprescindible</strong>? No dudéis comentar y en seguirnos en <a href="https://www.riffvalley.es/quienes-somos/quienes-somos" target="_blank" rel="noreferrer noopener">nuestras redes sociales</a>:</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"className":"text-justify"} -->
<p class="text-justify"><strong>Riff Valley App: </strong><a href="http://app.riffvalley.es/login" target="_blank" rel="noreferrer noopener">app.riffvalley.es/login</a><br><strong>Comunidad de Telegram:</strong>&nbsp;<a href="https://t.me/RiffValleyES" target="_blank" rel="noreferrer noopener">t.me/RiffValleyES</a><br><strong>Facebook:</strong>&nbsp;<a href="https://www.facebook.com/RiffValleyEs/" target="_blank" rel="noreferrer noopener">facebook.com/RiffValleyEs</a><br><strong>Instagram:</strong>&nbsp;<a href="https://www.instagram.com/riffvalleyes/" target="_blank" rel="noreferrer noopener">instagram.com/riffvalleyes</a><br><strong>Threads</strong>: <a href="https://www.threads.net/@riffvalleyes" target="_blank" rel="noreferrer noopener">https://www.threads.net/@riffvalleyes</a><br><strong>Twitter &#8211; X:&nbsp;</strong><a href="https://twitter.com/Riffvalleyes" target="_blank" rel="noreferrer noopener">twitter.com/Riffvalleyes</a><br><strong>Bluesky</strong>: <a href="https://bsky.app/profile/riffvalleyes.bsky.social" target="_blank" rel="noreferrer noopener">bsky.app/profile/riffvalleyes.bsky.social</a></p>
<!-- /wp:paragraph -->`;
}
