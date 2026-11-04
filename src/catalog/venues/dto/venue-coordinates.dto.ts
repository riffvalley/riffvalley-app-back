import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'coordinatePair', async: false })
export class CoordinatePairConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const value = args.object as { latitude?: unknown; longitude?: unknown };
    const hasLatitude = value.latitude !== undefined && value.latitude !== null;
    const hasLongitude =
      value.longitude !== undefined && value.longitude !== null;
    return hasLatitude === hasLongitude;
  }

  defaultMessage(): string {
    return 'Latitude and longitude must be supplied together';
  }
}
