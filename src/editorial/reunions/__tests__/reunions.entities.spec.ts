import { getMetadataArgsStorage } from 'typeorm';
import { Content } from 'src/editorial/contents/entities/content.entity';
import { Point } from '../points/entities/point.entity';
import { Reunion } from '../entities/reunion.entity';

describe('Reunion and Point relation metadata', () => {
  const relationFor = (target: object, propertyName: string) =>
    getMetadataArgsStorage().relations.find(
      (relation) =>
        relation.target === target && relation.propertyName === propertyName,
    );

  it('keeps Point deletion cascaded from Reunion', () => {
    const points = relationFor(Reunion, 'points');
    const reunion = relationFor(Point, 'reunion');

    expect(points).toMatchObject({
      relationType: 'one-to-many',
      options: { cascade: true },
    });
    expect(reunion).toMatchObject({
      relationType: 'many-to-one',
      options: { onDelete: 'CASCADE' },
    });
  });

  it('keeps Content references nullable and without a deletion cascade', () => {
    const contentReunion = relationFor(Content, 'reunion');

    expect(contentReunion).toMatchObject({
      relationType: 'many-to-one',
      options: { nullable: true },
    });
    expect(contentReunion?.options.onDelete).toBeUndefined();
    expect(
      getMetadataArgsStorage().joinColumns.find(
        (column) =>
          column.target === Content && column.propertyName === 'reunion',
      ),
    ).toMatchObject({
      name: 'reunionId',
    });
  });
});
