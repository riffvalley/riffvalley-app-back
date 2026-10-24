import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  List,
  ListType,
  PublishedWeeklyPostRecord,
} from '../entities/list.entity';
import { WordpressService } from 'src/integrations/wordpress-integration/wordpress.service';
import { ListWordPressReconciliationService } from './list-wordpress-reconciliation.service';
import {
  buildPostContent,
  buildWeeklyDiscSections,
  PublishableGutenbergDiscAssignment,
} from './list-gutenberg-builder';

type WeeklyPostResult = {
  position: number;
  wpPostId: number;
  link: string;
  title: string;
  added?: number;
  updated?: number;
  adopted?: boolean;
  removed?: number;
  warning?: string;
};

@Injectable()
export class WeeklyListPublisherService {
  private readonly logger = new Logger('ListsService');

  constructor(
    @InjectRepository(List)
    private readonly listRepository: Repository<List>,
    private readonly wordpressService: WordpressService,
    private readonly reconciliationService: ListWordPressReconciliationService,
  ) {}

  private static readonly ROMAN_NUMERALS = [
    'I',
    'II',
    'III',
    'IV',
    'V',
    'VI',
    'VII',
    'VIII',
    'IX',
    'X',
  ];

  async generateWordPressPosts(list: List, position?: number) {
    if (list.type !== ListType.WEEK) {
      throw new BadRequestException(
        'Only weekly lists can generate Radar posts',
      );
    }

    // Group asignations by position. Position 0 is the Radar inbox, not a
    // publishable editorial group; leave it untouched in the stored list.
    const byPosition = new Map<number, typeof list.asignations>();
    for (const asignation of list.asignations) {
      if (asignation.position === null || asignation.position === undefined) {
        continue;
      }
      if (asignation.position <= 0) {
        continue;
      }
      if (!byPosition.has(asignation.position)) {
        byPosition.set(asignation.position, []);
      }
      byPosition.get(asignation.position).push(asignation);
    }

    // Si se pide una posición concreta, solo se genera/actualiza esa página
    // en vez de todas las de la lista.
    if (position !== undefined && !byPosition.has(position)) {
      throw new BadRequestException(
        `La lista ${list.id} no tiene discos asignados a la posición ${position}`,
      );
    }

    const sortedPositions = (
      position !== undefined ? [position] : Array.from(byPosition.keys())
    ).sort((a, b) => a - b);

    const releaseDate = this.getWeeklyReleaseFriday(list);
    const day = releaseDate.getDate().toString().padStart(2, '0');
    const month = (releaseDate.getMonth() + 1).toString().padStart(2, '0');
    const year = releaseDate.getFullYear();
    const dateStr = `${day}/${month}/${year}`;

    const monthNames = [
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
      'diciembre',
    ];
    const monthName = monthNames[releaseDate.getMonth()];

    const CATEGORIES = [2049, 184]; // Novedades, Radar de Novedades
    const FIXED_TAGS = [189, 2088, 188]; // novedades, nuevos discos semanales, radar

    const [yearTagId, monthTagId] = await Promise.all([
      this.wordpressService.getOrCreateTag(String(year)),
      this.wordpressService.getOrCreateTag(monthName),
    ]);
    const tags = [...FIXED_TAGS, yearTagId, monthTagId];

    const createdPosts: WeeklyPostResult[] = [];

    for (const position of sortedPositions) {
      const discs = byPosition.get(position);
      const roman =
        WeeklyListPublisherService.ROMAN_NUMERALS[position - 1] ??
        `${position}`;

      const title = this.buildWeeklyPostTitle(list, position);
      const seoTitle = `Nuevos discos ${day} de ${monthName} de ${year} (${roman}) • Riff Valley`;
      const seoDescription = `Nuevos discos de ${monthName} de ${year}: os recopilamos los lanzamientos de la semana del ${dateStr} que no te puedes perder.`;
      const slug = `nuevos-discos${day}${month}${String(year).slice(-2)}${roman.toLowerCase()}`;

      const meta = {
        rank_math_title: seoTitle,
        rank_math_description: seoDescription,
        rank_math_focus_keyword: `nuevos discos,${monthName},${year},${roman.toLowerCase()}`,
      };

      const entry = (list.wpWeeklyPosts ?? []).find(
        (e) => e.position === position,
      );

      if (entry) {
        const existingPost = await this.wordpressService.getPost(
          entry.wpPostId,
        );

        // El post enlazado ya no existe o está en la papelera: soltamos el
        // tracking y caemos al flujo de "no hay entry" de abajo, que busca
        // por slug o crea uno nuevo (mismo patrón que generateBestDiscsWordPressPost).
        if (!existingPost || existingPost.status === 'trash') {
          this.logger.warn(
            `Linked WP post #${entry.wpPostId} for list ${list.id} position ${position} is missing or trashed, creating a new one`,
          );
          list.wpWeeklyPosts = (list.wpWeeklyPosts ?? []).filter(
            (e) => e.position !== position,
          );
        } else {
          const result = await this.reconciliationService.syncDiscsIntoPost(
            entry.wpPostId,
            existingPost.content,
            discs,
            entry.publishedDiscs ?? [],
            (d, trackIds) => buildWeeklyDiscSections(d, trackIds, title),
            false,
            existingPost.status === 'publish',
          );

          list.wpWeeklyPosts = [
            ...(list.wpWeeklyPosts ?? []).filter(
              (e) => e.position !== position,
            ),
            { ...entry, publishedDiscs: result.publishedDiscs },
          ];

          const postResult: WeeklyPostResult = {
            position,
            wpPostId: entry.wpPostId,
            link: entry.wpPostUrl,
            title,
            added: result.newCount,
            updated: result.existingCount - result.notFoundForUpdate,
          };

          if (result.removedDiscs.length) {
            const names = result.removedDiscs
              .map((d) => `${d.artist} – ${d.name}`)
              .join(', ');
            postResult.removed = result.removedDiscs.length;
            postResult.warning = `${result.removedDiscs.length} disco(s) eliminado(s) de la lista seguían publicados en WordPress y no se han quitado del post automáticamente: ${names}. Revisa y edita el post manualmente si corresponde.`;
          }

          if (result.notFoundForUpdate > 0) {
            const extra = `${result.notFoundForUpdate} disco(s) editado(s) no se encontraron en el post (¿se borró su marcador manualmente en el editor de WordPress?) y no se pudieron actualizar automáticamente.`;
            postResult.warning = postResult.warning
              ? `${postResult.warning} ${extra}`
              : extra;
          }

          createdPosts.push(postResult);
          continue;
        }
      }

      // No hay tracking para esta posición: puede que el post ya existiera
      // de antes de este sistema (lo buscamos por slug y lo "adoptamos") o
      // que no exista todavía (lo creamos desde cero).
      const existingBySlug = await this.wordpressService.findPostBySlug(slug);
      if (existingBySlug) {
        this.logger.log(
          `WP post already exists for slug ${slug} (#${existingBySlug.id}), adopting it for position ${position}`,
        );

        const existingContent = await this.wordpressService.getPost(
          existingBySlug.id,
        );
        if (!existingContent || existingContent.status === 'trash') {
          throw this.reconciliationService.uncertainWordPressResult(
            `post slug ${slug} was found but could not be read safely`,
          );
        }
        const result = await this.reconciliationService.syncDiscsIntoPost(
          existingBySlug.id,
          existingContent.content,
          discs,
          [],
          (d, trackIds) => buildWeeklyDiscSections(d, trackIds, title),
          false,
          existingContent.status === 'publish',
        );

        const newEntry: PublishedWeeklyPostRecord = {
          position,
          wpPostId: existingBySlug.id,
          wpPostUrl: existingBySlug.link,
          publishedDiscs: result.publishedDiscs,
        };
        list.wpWeeklyPosts = [
          ...(list.wpWeeklyPosts ?? []).filter((e) => e.position !== position),
          newEntry,
        ];

        createdPosts.push({
          position,
          wpPostId: existingBySlug.id,
          link: existingBySlug.link,
          title,
          adopted: true,
          added: result.newCount,
        });
        continue;
      }

      const spotifyTrackIds = await Promise.all(
        discs.map((a) => this.reconciliationService.resolveSpotifyTrackId(a)),
      );

      const content = buildPostContent(
        discs,
        position,
        list,
        title,
        spotifyTrackIds,
      );

      const { post, reconciled } =
        await this.reconciliationService.createPostAndReconcile(
          title,
          content,
          'draft',
          meta,
          CATEGORIES,
          tags,
          slug,
        );

      let publishedDiscs = discs.map((a) =>
        this.reconciliationService.toPublishedDiscRecord(a),
      );
      if (reconciled) {
        const remotePost = await this.wordpressService.getPost(post.id);
        if (!remotePost || remotePost.status === 'trash') {
          throw this.reconciliationService.uncertainWordPressResult(
            `post slug ${slug} was found but its content could not be confirmed`,
          );
        }

        const result = await this.reconciliationService.syncDiscsIntoPost(
          post.id,
          remotePost.content,
          discs,
          [],
          (d, trackIds) => buildWeeklyDiscSections(d, trackIds, title),
          false,
          remotePost.status === 'publish',
        );
        publishedDiscs = result.publishedDiscs;
      }

      const newEntry: PublishedWeeklyPostRecord = {
        position,
        wpPostId: post.id,
        wpPostUrl: post.link,
        publishedDiscs,
      };
      list.wpWeeklyPosts = [
        ...(list.wpWeeklyPosts ?? []).filter((e) => e.position !== position),
        newEntry,
      ];

      createdPosts.push({
        position,
        wpPostId: post.id,
        link: post.link,
        title,
      });
    }

    await this.listRepository.save(list);

    return { created: createdPosts.length, posts: createdPosts };
  }

  // Igual que syncDiscToMonthlyPost pero para el post semanal de "nuevos
  // discos" correspondiente a la posición del disco. Cada posición tiene su
  // propio post (ver wpWeeklyPosts / generateWordPressPosts), así que
  // primero hay que localizar la entrada trackeada de esa posición.
  async syncDiscToWeeklyPost(
    list: List,
    asignation: PublishableGutenbergDiscAssignment,
  ) {
    const position = asignation.position;
    if (position === null || position === undefined || position <= 0) {
      return { synced: false };
    }

    const entry = (list.wpWeeklyPosts ?? []).find(
      (e) => e.position === position,
    );
    if (!entry) {
      // Todavía no se ha generado el post de esa posición: se recogerá con
      // el próximo "generar/actualizar" manual.
      return { synced: false };
    }

    const existingPost = await this.wordpressService.getPost(entry.wpPostId);
    if (!existingPost || existingPost.status === 'trash') {
      return { synced: false };
    }

    const spotifyTrackId =
      await this.reconciliationService.resolveSpotifyTrackId(asignation);
    const title = this.buildWeeklyPostTitle(list, position);
    const block = buildWeeklyDiscSections(
      [asignation],
      [spotifyTrackId],
      title,
    );

    const publishedDiscs = entry.publishedDiscs ?? [];
    const alreadyPublished = publishedDiscs.some(
      (d) => d.discId === asignation.disc.id,
    );
    const remoteBoundary = this.reconciliationService.getUniqueDiscSection(
      existingPost.content,
      asignation.disc.id,
    );

    if (alreadyPublished && !remoteBoundary) {
      throw this.reconciliationService.uncertainWordPressResult(
        `disc ${asignation.disc.id} is tracked locally but its WordPress block is missing`,
      );
    }

    const updatedContent = remoteBoundary
      ? this.reconciliationService.replaceDiscSection(
          existingPost.content,
          asignation.disc.id,
          block,
        )
      : this.reconciliationService.insertBeforeFooter(
          existingPost.content,
          block,
        );

    if (updatedContent === null) {
      throw this.reconciliationService.uncertainWordPressResult(
        `disc ${asignation.disc.id} could not be safely located in WordPress`,
      );
    }

    await this.reconciliationService.updatePostContentWithReconciliation(
      entry.wpPostId,
      updatedContent,
      alreadyPublished ? [] : [asignation.disc.id],
      existingPost.status === 'publish',
    );

    if (!alreadyPublished) {
      list.wpWeeklyPosts = [
        ...(list.wpWeeklyPosts ?? []).filter((e) => e.position !== position),
        {
          ...entry,
          publishedDiscs: [
            ...publishedDiscs.filter((d) => d.discId !== asignation.disc.id),
            this.reconciliationService.toPublishedDiscRecord(asignation),
          ],
        },
      ];
      await this.listRepository.save(list);
    }

    return { synced: true };
  }

  // Los lanzamientos musicales son los viernes: usamos siempre el viernes
  // de la semana de lanzamiento para nombrar el post, igual que
  // generateWordPressPosts.
  private getWeeklyReleaseFriday(list: List): Date {
    const rawReleaseDate = list.releaseDate
      ? new Date(list.releaseDate)
      : new Date();
    const releaseDate = new Date(rawReleaseDate);
    const daysSinceFriday = (rawReleaseDate.getDay() + 2) % 7; // Fri=0, Sat=1, Sun=2, Mon=3...
    releaseDate.setDate(releaseDate.getDate() - daysSinceFriday);
    return releaseDate;
  }

  private buildWeeklyPostTitle(list: List, position: number): string {
    const releaseDate = this.getWeeklyReleaseFriday(list);
    const day = releaseDate.getDate().toString().padStart(2, '0');
    const month = (releaseDate.getMonth() + 1).toString().padStart(2, '0');
    const year = releaseDate.getFullYear();
    const roman =
      WeeklyListPublisherService.ROMAN_NUMERALS[position - 1] ?? `${position}`;
    return `Nuevos discos - ${day}/${month}/${year} (${roman})`;
  }
}
