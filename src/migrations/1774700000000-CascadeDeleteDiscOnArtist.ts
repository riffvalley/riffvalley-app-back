import { MigrationInterface, QueryRunner, TableForeignKey } from 'typeorm';

export class CascadeDeleteDiscOnArtist1774700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('disc');
    const fk = table.foreignKeys.find((f) => f.columnNames.includes('artistId'));
    if (fk) await queryRunner.dropForeignKey('disc', fk);

    await queryRunner.createForeignKey(
      'disc',
      new TableForeignKey({
        columnNames: ['artistId'],
        referencedTableName: 'artist',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('disc');
    const fk = table.foreignKeys.find((f) => f.columnNames.includes('artistId'));
    if (fk) await queryRunner.dropForeignKey('disc', fk);

    await queryRunner.createForeignKey(
      'disc',
      new TableForeignKey({
        columnNames: ['artistId'],
        referencedTableName: 'artist',
        referencedColumnNames: ['id'],
        onDelete: 'NO ACTION',
      }),
    );
  }
}
