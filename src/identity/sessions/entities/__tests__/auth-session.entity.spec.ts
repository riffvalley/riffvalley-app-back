import { DataSource, getMetadataArgsStorage } from 'typeorm';
import { EntityMetadataBuilder } from 'typeorm/metadata-builder/EntityMetadataBuilder';
import { User } from '../../../auth/entities/user.entity';
import { AuthRefreshToken } from '../auth-refresh-token.entity';
import { AuthSession } from '../auth-session.entity';

describe('session persistence TypeORM metadata', () => {
  const metadata = getMetadataArgsStorage();

  it('maps the session identity, ownership, lifecycle and client constraints', () => {
    expect(metadata.tables).toContainEqual(
      expect.objectContaining({ target: AuthSession, name: 'auth_sessions' }),
    );
    expect(metadata.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: AuthSession,
          propertyName: 'id',
          options: expect.objectContaining({
            primaryKeyConstraintName: 'PK_auth_sessions',
          }),
        }),
        expect.objectContaining({
          target: AuthSession,
          propertyName: 'clientType',
          options: expect.objectContaining({ name: 'client_type' }),
        }),
        expect.objectContaining({
          target: AuthSession,
          propertyName: 'expiresAt',
          options: expect.objectContaining({
            name: 'expires_at',
            type: 'timestamptz',
          }),
        }),
        expect.objectContaining({
          target: AuthSession,
          propertyName: 'revokedAt',
          options: expect.objectContaining({
            name: 'revoked_at',
            nullable: true,
          }),
        }),
      ]),
    );
    expect(metadata.relations).toContainEqual(
      expect.objectContaining({
        target: AuthSession,
        propertyName: 'user',
        relationType: 'many-to-one',
        options: expect.objectContaining({
          nullable: false,
          onDelete: 'CASCADE',
        }),
      }),
    );
    expect(metadata.joinColumns).toContainEqual(
      expect.objectContaining({
        target: AuthSession,
        propertyName: 'user',
        name: 'user_id',
        foreignKeyConstraintName: 'FK_auth_sessions_user',
      }),
    );
    const sessionUserRelation = metadata.relations.find(
      (relation) =>
        relation.target === AuthSession && relation.propertyName === 'user',
    );
    expect(sessionUserRelation?.type).toEqual(expect.any(Function));
    expect(metadata.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: AuthSession,
          name: 'CHK_auth_sessions_client_type',
          expression: "\"client_type\" IN ('app', 'wiki')",
        }),
        expect.objectContaining({
          target: AuthSession,
          name: 'CHK_auth_sessions_expiration_after_creation',
          expression: '"expires_at" > "created_at"',
        }),
      ]),
    );
    expect(metadata.indices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: AuthSession,
          name: 'IDX_auth_sessions_user_client_revoked',
        }),
        expect.objectContaining({
          target: AuthSession,
          name: 'IDX_auth_sessions_expires_at',
        }),
      ]),
    );
  });

  it('builds the owner foreign key to users with the migration cascade rule', () => {
    const dataSource = new DataSource({
      type: 'postgres',
      entities: [User, AuthSession, AuthRefreshToken],
    });
    const entities = new EntityMetadataBuilder(
      dataSource,
      getMetadataArgsStorage(),
    ).build();
    const session = entities.find((entity) => entity.target === AuthSession);

    expect(session?.foreignKeys).toContainEqual(
      expect.objectContaining({
        name: 'FK_auth_sessions_user',
        referencedTablePath: 'users',
        onDelete: 'CASCADE',
      }),
    );
  });

  it('stores only a binary refresh digest and rotation metadata, never a bearer value', () => {
    expect(metadata.tables).toContainEqual(
      expect.objectContaining({
        target: AuthRefreshToken,
        name: 'auth_refresh_tokens',
      }),
    );
    expect(metadata.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: AuthRefreshToken,
          propertyName: 'tokenHash',
          options: expect.objectContaining({
            name: 'token_hash',
            type: 'bytea',
          }),
        }),
        expect.objectContaining({
          target: AuthRefreshToken,
          propertyName: 'consumedAt',
          options: expect.objectContaining({
            name: 'consumed_at',
            nullable: true,
          }),
        }),
        expect.objectContaining({
          target: AuthRefreshToken,
          propertyName: 'operationKeyHash',
          options: expect.objectContaining({
            name: 'operation_key_hash',
            type: 'bytea',
            nullable: true,
          }),
        }),
      ]),
    );
    expect(
      metadata.columns
        .filter((column) => column.target === AuthRefreshToken)
        .map((column) => column.propertyName),
    ).not.toContain('token');
    expect(metadata.indices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: AuthRefreshToken,
          name: 'UQ_auth_refresh_tokens_token_hash',
          unique: true,
        }),
        expect.objectContaining({
          target: AuthRefreshToken,
          name: 'UQ_auth_refresh_tokens_one_unconsumed_per_session',
          unique: true,
          where: '"consumed_at" IS NULL',
        }),
        expect.objectContaining({
          target: AuthRefreshToken,
          name: 'IDX_auth_refresh_tokens_session_consumed',
        }),
      ]),
    );
    expect(metadata.uniques).toContainEqual(
      expect.objectContaining({
        target: AuthRefreshToken,
        name: 'UQ_auth_refresh_tokens_replaced_by',
      }),
    );
    expect(metadata.relationIds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: AuthSession,
          propertyName: 'userId',
        }),
        expect.objectContaining({
          target: AuthRefreshToken,
          propertyName: 'sessionId',
        }),
      ]),
    );
  });
});
