export class InvalidSessionClientError extends Error {
  constructor() {
    super('Unsupported session client.');
    this.name = InvalidSessionClientError.name;
  }
}

export class SessionOwnerUnavailableError extends Error {
  constructor() {
    super('Session owner is unavailable.');
    this.name = SessionOwnerUnavailableError.name;
  }
}

export class InvalidSessionCredentialError extends Error {
  constructor() {
    super('Session credential is invalid.');
    this.name = InvalidSessionCredentialError.name;
  }
}

export class RefreshOperationAlreadyProcessedError extends Error {
  constructor() {
    super('Refresh operation has already been processed.');
    this.name = RefreshOperationAlreadyProcessedError.name;
  }
}

export class RefreshTokenReuseDetectedError extends Error {
  constructor() {
    super('Refresh token reuse detected.');
    this.name = RefreshTokenReuseDetectedError.name;
  }
}
