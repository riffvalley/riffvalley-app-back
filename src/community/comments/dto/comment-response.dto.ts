export class CommentResponseDto {
  id: string;
  comment: string;
  createdAt: Date;
  editedAt: Date | null;
  parentId: string | null;

  // Indicamos si está o no eliminado
  isDeleted: boolean;

  user: {
    id: string;
    username: string;
    image: string | null;
  };

  disc: {
    id: string;
    name: string;
  };
}
