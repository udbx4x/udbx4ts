export class GaiaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GaiaError";
  }
}

export class GaiaFormatError extends GaiaError {
  constructor(message: string) {
    super(message);
    this.name = "GaiaFormatError";
  }
}

export class GaiaGeoTypeMismatchError extends GaiaError {
  constructor(expected: number, actual: number) {
    super(`Expected geoType=${expected}, got ${actual}.`);
    this.name = "GaiaGeoTypeMismatchError";
  }
}

export class GaiaUnsupportedGeoTypeError extends GaiaError {
  constructor(geoType: number) {
    super(`Unsupported GAIA geoType: ${geoType}.`);
    this.name = "GaiaUnsupportedGeoTypeError";
  }
}

