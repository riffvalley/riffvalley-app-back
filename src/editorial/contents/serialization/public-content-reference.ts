/** The only Content data exposed by public editorial-resource responses. */
export interface PublicContentReference {
  id: string;
}

type ContentReferenceOwner = {
  content?: { id: string } | null;
};

export function toPublicContentReference<T extends ContentReferenceOwner>(
  entity: T,
): Omit<T, 'content'> & { content?: PublicContentReference | null } {
  return {
    ...entity,
    ...(entity.content === undefined
      ? {}
      : { content: entity.content ? { id: entity.content.id } : null }),
  };
}
