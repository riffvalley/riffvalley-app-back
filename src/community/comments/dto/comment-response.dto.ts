export class CommentResponseDto {
  id: string;
  comment: string;
  createdAt: Date;
  parentId: string | null;

  // Indicamos si está o no eliminado
  isDeleted: boolean;

  user: {
    id: string;
    username: string;
  };

  disc: {
    id: string;
    name: string;
  };
}
