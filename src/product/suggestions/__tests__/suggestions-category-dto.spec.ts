import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSuggestionDto } from '../dto/create-suggestion.dto';
import { SuggestionsQueryDto } from '../dto/suggestions-query.dto';
import { UpdateSuggestionDto } from '../dto/update-suggestion.dto';

describe('Suggestion category DTOs', () => {
  it.each([
    'albums',
    'artists',
    'votes',
    'statistics',
    'rankings',
    'events',
    'home',
    'account',
    'other',
  ])(
    'accepts the fixed category %s when creating feedback',
    async (category) => {
      const dto = plainToInstance(CreateSuggestionDto, {
        title: 'Title',
        description: 'Description',
        category,
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
    },
  );

  it('temporarily accepts the existing create payload with no category', async () => {
    const dto = plainToInstance(CreateSuggestionDto, {
      title: 'Title',
      description: 'Description',
      type: 'bug',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('does not accept null as a new submission category', async () => {
    const dto = plainToInstance(CreateSuggestionDto, {
      title: 'Title',
      description: 'Description',
      category: null,
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it('rejects unknown categories on create and administrative correction', async () => {
    const createDto = plainToInstance(CreateSuggestionDto, {
      title: 'Title',
      description: 'Description',
      category: 'editorial',
    });
    const updateDto = plainToInstance(UpdateSuggestionDto, {
      category: 'wiki',
    });

    await expect(validate(createDto)).resolves.not.toHaveLength(0);
    await expect(validate(updateDto)).resolves.not.toHaveLength(0);
  });

  it('accepts all, uncategorized, and a catalog category as query values', async () => {
    await expect(
      validate(plainToInstance(SuggestionsQueryDto, {})),
    ).resolves.toHaveLength(0);
    await expect(
      validate(
        plainToInstance(SuggestionsQueryDto, { category: 'uncategorized' }),
      ),
    ).resolves.toHaveLength(0);
    await expect(
      validate(plainToInstance(SuggestionsQueryDto, { category: 'events' })),
    ).resolves.toHaveLength(0);
  });

  it('rejects unknown category query filters', async () => {
    const dto = plainToInstance(SuggestionsQueryDto, {
      category: 'internal-tools',
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it('does not change validation behavior for existing type and status filters', async () => {
    const dto = plainToInstance(SuggestionsQueryDto, {
      type: 'legacy-value',
      status: 'legacy-value',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('allows an administrator to clear a category back to null', async () => {
    const dto = plainToInstance(UpdateSuggestionDto, { category: null });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
