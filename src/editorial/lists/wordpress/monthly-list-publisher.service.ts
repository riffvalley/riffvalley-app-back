import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { List, ListType } from '../entities/list.entity';
import { WordpressService } from 'src/integrations/wordpress-integration/wordpress.service';
import { ListWordPressReconciliationService } from './list-wordpress-reconciliation.service';
import {
  buildBestDiscsPostContent,
  buildDiscSections,
  PublishableGutenbergDiscAssignment,
} from './list-gutenberg-builder';

@Injectable()
export class MonthlyListPublisherService {
  private readonly logger = new Logger('ListsService');

  constructor(
    @InjectRepository(List)
    private readonly listRepository: Repository<List>,
    private readonly wordpressService: WordpressService,
    private readonly reconciliationService: ListWordPressReconciliationService,
  ) {}

  async generateBestDiscsWordPressPost(list: List) {
    if (list.type !== ListType.MONTH) {
      throw new BadRequestException(
        'Only monthly lists can generate a "Mejores discos" post',
      );
    }

    const allDiscs = list.asignations
      .filter((a) => a.disc)
      .sort(
        (a, b) =>
          (a.position ?? Number.MAX_SAFE_INTEGER) -
          (b.position ?? Number.MAX_SAFE_INTEGER),
      );

    if (!allDiscs.length) {
      throw new BadRequestException('List has no assigned discs');
    }

    const listDate = list.listDate ? new Date(list.listDate) : new Date();
    const year = listDate.getFullYear();

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
    const monthName = monthNames[listDate.getMonth()];
    const title = `Mejores discos de ${monthName} ${year}`;

    if (list.wpPostId) {
      const existingPost = await this.wordpressService.getPost(list.wpPostId);

      // El post enlazado ya no existe (404) o lo movieron a la papelera
      // (WordPress lo sigue sirviendo con status "trash", no da 404): la
      // referencia guardada está muerta, así que la soltamos y generamos
      // un post nuevo desde cero en vez de reventar o escribir a ciegas
      // sobre un post que nadie va a ver.
      if (!existingPost || existingPost.status === 'trash') {
        this.logger.warn(
          `Linked WP post #${list.wpPostId} for list ${list.id} is missing or trashed, creating a new one`,
        );
        list.wpPostId = null;
        list.wpPostUrl = null;
        list.wpPublishedDiscs = null;

        const created = await this.createBestDiscsPost(
          list,
          allDiscs,
          title,
          monthName,
          year,
        );
        return { ...created, recreated: true };
      }

      return this.appendNewDiscsToBestPost(
        list,
        allDiscs,
        title,
        existingPost.content,
      );
    }

    return this.createBestDiscsPost(list, allDiscs, title, monthName, year);
  }

  async syncDiscToMonthlyPost(
    list: List,
    asignation: PublishableGutenbergDiscAssignment,
  ) {
    if (!list.wpPostId) {
      // Todavía no hay post que actualizar: se recogerá con el próximo
      // "generar/actualizar" manual.
      return { synced: false };
    }

    const existingPost = await this.wordpressService.getPost(list.wpPostId);
    if (!existingPost || existingPost.status === 'trash') {
      // El post enlazado ya no existe o está en la papelera: no forzamos
      // nada aquí, que se resuelva con el flujo normal de
      // "generar/actualizar" (que ya sabe recrear el post si hace falta).
      return { synced: false };
    }

    const [spotifyTrackId, authors] = await Promise.all([
      this.reconciliationService.resolveSpotifyTrackId(asignation),
      this.reconciliationService.resolveAuthors([asignation]),
    ]);

    const block = buildDiscSections([asignation], [spotifyTrackId], authors);

    const publishedDiscs = list.wpPublishedDiscs ?? [];
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
      list.wpPostId,
      updatedContent,
      alreadyPublished ? [] : [asignation.disc.id],
    );

    if (!alreadyPublished) {
      list.wpPublishedDiscs = [
        ...publishedDiscs.filter((d) => d.discId !== asignation.disc.id),
        this.reconciliationService.toPublishedDiscRecord(asignation),
      ];
      await this.listRepository.save(list);
    }

    return { synced: true };
  }

  private async createBestDiscsPost(
    list: List,
    allDiscs: PublishableGutenbergDiscAssignment[],
    title: string,
    monthName: string,
    year: number,
  ) {
    const seoTitle = `Mejores discos de ${monthName} de ${year} • Riff Valley`;
    const seoDescription = `Os dejamos un listado con una selección de los mejores discos del mes de ${monthName} de ${year}. ¡No te los pierdas!`;
    const slug = `mejores-discos-de-${monthName}-${year}`;

    const CATEGORIES = [72, 597]; // Artículos, Mejores discos del mes
    const FIXED_TAGS = [219, 235, 2030, 2031]; // Discos, Mejores, Bandas mainstream, Bandas underground

    const meta = {
      rank_math_title: seoTitle,
      rank_math_description: seoDescription,
      rank_math_focus_keyword: `mejores discos,${monthName},${year}`,
    };

    const existing = await this.wordpressService.findPostBySlug(slug);
    if (existing) {
      if (existing.status === 'trash') {
        throw new ConflictException(
          `WordPress post slug ${slug} is in the trash; review it manually before publishing`,
        );
      }
      this.logger.log(
        `WP post already exists for slug ${slug} (#${existing.id}), linking list to it`,
      );
      await this.linkListToWpPost(list, allDiscs, existing.id, existing.link);
      return {
        wpPostId: existing.id,
        link: existing.link,
        title,
        skipped: true,
      };
    }

    const [yearTagId, monthTagId, spotifyTrackIds, authors] = await Promise.all(
      [
        this.wordpressService.getOrCreateTag(String(year)),
        this.wordpressService.getOrCreateTag(monthName),
        Promise.all(
          allDiscs.map((a) =>
            this.reconciliationService.resolveSpotifyTrackId(a),
          ),
        ),
        this.reconciliationService.resolveAuthors(allDiscs),
      ],
    );
    const tags = [...FIXED_TAGS, yearTagId, monthTagId];

    const content = buildBestDiscsPostContent(
      allDiscs,
      monthName,
      year,
      spotifyTrackIds,
      authors,
    );

    const { post } = await this.reconciliationService.createPostAndReconcile(
      title,
      content,
      'draft',
      meta,
      CATEGORIES,
      tags,
      slug,
    );

    await this.linkListToWpPost(list, allDiscs, post.id, post.link);

    return { wpPostId: post.id, link: post.link, title };
  }

  private async linkListToWpPost(
    list: List,
    publishedDiscs: PublishableGutenbergDiscAssignment[],
    wpPostId: number,
    wpPostUrl: string,
  ) {
    list.wpPostId = wpPostId;
    list.wpPostUrl = wpPostUrl;
    list.wpPublishedDiscs = publishedDiscs.map((a) =>
      this.reconciliationService.toPublishedDiscRecord(a),
    );
    await this.listRepository.save(list);
  }

  private async appendNewDiscsToBestPost(
    list: List,
    allDiscs: PublishableGutenbergDiscAssignment[],
    title: string,
    currentContent: string,
  ) {
    const publishedDiscs = list.wpPublishedDiscs ?? [];

    const syncResult = await this.reconciliationService.syncDiscsIntoPost(
      list.wpPostId,
      currentContent,
      allDiscs,
      publishedDiscs,
      (discs, spotifyTrackIds, authors) =>
        buildDiscSections(discs, spotifyTrackIds, authors),
      true,
    );

    if (syncResult.trackingChanged) {
      list.wpPublishedDiscs = syncResult.publishedDiscs;
      await this.listRepository.save(list);
    }

    const result: {
      wpPostId: number;
      link: string;
      title: string;
      added: number;
      updated: number;
      message?: string;
      removed?: number;
      warning?: string;
    } = {
      wpPostId: list.wpPostId,
      link: list.wpPostUrl,
      title,
      added: syncResult.newCount,
      updated: syncResult.existingCount - syncResult.notFoundForUpdate,
    };

    if (
      !syncResult.newCount &&
      !syncResult.existingCount &&
      !syncResult.removedDiscs.length
    ) {
      result.message = 'No new discs to add';
    }

    if (syncResult.removedDiscs.length) {
      const names = syncResult.removedDiscs
        .map((d) => `${d.artist} – ${d.name}`)
        .join(', ');
      result.removed = syncResult.removedDiscs.length;
      result.warning = `${syncResult.removedDiscs.length} disco(s) eliminado(s) de la lista seguían publicados en WordPress y no se han quitado del post automáticamente: ${names}. Revisa y edita el post manualmente si corresponde.`;
    }

    if (syncResult.notFoundForUpdate > 0) {
      const extra = `${syncResult.notFoundForUpdate} disco(s) editado(s) no se encontraron en el post (¿se borró su marcador manualmente en el editor de WordPress?) y no se pudieron actualizar automáticamente.`;
      result.warning = result.warning ? `${result.warning} ${extra}` : extra;
    }

    return result;
  }
}
