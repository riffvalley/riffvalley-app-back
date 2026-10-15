export type CatalogImportResultStatus = 'imported' | 'duplicate' | 'failed';

export type CatalogImportFailureReasonCode =
  | 'INVALID_INPUT'
  | 'RE_RELEASE'
  | 'REFERENCE_NOT_FOUND'
  | 'PERSISTENCE_FAILED';

export type CatalogImportResultSource =
  | {
      kind: 'manual';
      inputLine?: string;
    }
  | {
      kind: 'excel';
      sheet: string;
      rowNumber: number;
    };

interface CatalogImportResultBase {
  inputIndex: number;
  source: CatalogImportResultSource;
  artistName?: string;
  discName?: string;
  message: string;
}

export interface CatalogImportImportedResult extends CatalogImportResultBase {
  status: 'imported';
  artistName: string;
  discName: string;
  artistId: string;
  discId: string;
}

export interface CatalogImportDuplicateResult extends CatalogImportResultBase {
  status: 'duplicate';
  artistName: string;
  discName: string;
  artistId: string;
  discId: string;
}

export interface CatalogImportFailedResult extends CatalogImportResultBase {
  status: 'failed';
  reasonCode: CatalogImportFailureReasonCode;
  artistId?: string;
  discId?: string;
}

export type CatalogImportResultItem =
  | CatalogImportImportedResult
  | CatalogImportDuplicateResult
  | CatalogImportFailedResult;

export interface CatalogImportResultsData {
  results: CatalogImportResultItem[];
}
