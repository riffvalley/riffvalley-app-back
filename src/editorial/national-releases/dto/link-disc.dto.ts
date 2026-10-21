import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  isUUID,
  MaxLength,
  MinLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

type LinkDiscOption = {
  discId?: unknown;
  name?: unknown;
  artistId?: unknown;
  genreId?: unknown;
  releaseDate?: unknown;
  ep?: unknown;
  debut?: unknown;
  link?: unknown;
  image?: unknown;
};

export function hasExactlyOneLinkDiscOption(option: LinkDiscOption): boolean {
  const hasDiscId =
    typeof option.discId === 'string' && option.discId.length > 0;
  const hasNewDiscData = [
    option.name,
    option.artistId,
    option.genreId,
    option.releaseDate,
    option.ep,
    option.debut,
    option.link,
    option.image,
  ].some((value) => value !== undefined && value !== null);
  const hasValidNewDiscData =
    typeof option.name === 'string' && option.name.length > 0;

  return (
    hasDiscId !== hasNewDiscData && (!hasNewDiscData || hasValidNewDiscData)
  );
}

@ValidatorConstraint({ name: 'exactlyOneLinkDiscOption', async: false })
class ExactlyOneLinkDiscOptionConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown, args: ValidationArguments): boolean {
    const body = args.object;
    if (
      !hasExactlyOneLinkDiscOption({
        discId: 'discId' in body ? body.discId : undefined,
        name: 'name' in body ? body.name : undefined,
        artistId: 'artistId' in body ? body.artistId : undefined,
        genreId: 'genreId' in body ? body.genreId : undefined,
        releaseDate: 'releaseDate' in body ? body.releaseDate : undefined,
        ep: 'ep' in body ? body.ep : undefined,
        debut: 'debut' in body ? body.debut : undefined,
        link: 'link' in body ? body.link : undefined,
        image: 'image' in body ? body.image : undefined,
      })
    ) {
      return false;
    }

    return value === undefined || value === null || isUUID(value);
  }

  defaultMessage(args: ValidationArguments): string {
    if (args.value !== undefined && args.value !== null) {
      return 'discId must be a UUID';
    }
    return 'Provide discId to link an existing disc, or name to create a new one';
  }
}

export class LinkDiscDto {
  // Opción A: vincular un disco existente
  @Validate(ExactlyOneLinkDiscOptionConstraint)
  discId?: string;

  // Opción B: crear un disco nuevo y vincularlo
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsUUID()
  @IsOptional()
  artistId?: string;

  @IsUUID()
  @IsOptional()
  genreId?: string;

  @IsDateString()
  @IsOptional()
  releaseDate?: string;

  @IsBoolean()
  @IsOptional()
  ep?: boolean;

  @IsBoolean()
  @IsOptional()
  debut?: boolean;

  @IsUrl()
  @IsOptional()
  @MaxLength(255)
  link?: string;

  @IsString()
  @IsOptional()
  image?: string;
}
