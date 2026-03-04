import { IsEnum, IsISO8601, IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';
import { ArticleStatus, ArticleType } from '../entities/article.entity';

export class CreateArticleDto {
    @IsString()
    @MaxLength(200)
    name: string;

    @IsEnum(ArticleStatus)
    status: ArticleStatus;

    @IsUrl()
    @IsOptional()
    @MaxLength(500)
    link?: string;

    @IsEnum(ArticleType)
    type: ArticleType;

    @IsISO8601()
    @IsOptional()
    updateDate: string; // ISO8601 string

    @IsUUID()
    @IsOptional()
    userId?: string;

    @IsUUID()
    @IsOptional()
    editorId?: string;

    @IsUUID()
    @IsOptional()
    coauthorId?: string;
}
