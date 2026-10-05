import { PartialType } from '@nestjs/mapped-types';
import { CreateRiffValleyPlaylistDto } from './create-riff-valley-playlist.dto';

export class UpdateRiffValleyPlaylistDto extends PartialType(CreateRiffValleyPlaylistDto) {}
