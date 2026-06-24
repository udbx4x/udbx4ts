import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  GaiaGeometryCodec,
  CadGeometryCodec,
  GeoTextCodec,
  type DatasetInfo,
  type FieldType,
  type FieldInfo,
  type Feature,
  type Geometry,
  type MultiLineStringGeometry,
  type MultiPolygonGeometry,
  type PointGeometry,
  type TabularRecord,
  type TextGeometry,
  UdbxDataSource
} from "../../src/index";
import { NodeSqliteDriver } from "../support/NodeSqliteDriver";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "../../..");
const specRoot = resolve(workspaceRoot, "udbx4spec");
const goldenRoot = resolve(specRoot, "compliance/golden-gaia-bytes");
const goldenManifestPath = resolve(goldenRoot, "manifest.json");
const fixtureManifestPath = resolve(specRoot, "compliance/fixtures/manifest.json");
const complianceDbPath = resolve(specRoot, "compliance/compliance.udbx");
const roundtripManifestPath = resolve(specRoot, "compliance/roundtrip/manifest.json");
const roundtripRoot = resolve(specRoot, "compliance/roundtrip");
const sourceDerivedRoot = resolve(specRoot, "compliance/source-derived");

interface GoldenFixtureEntry {
  readonly id: string;
  readonly path: string;
  readonly geometryType: string;
  readonly geoType: number;
  readonly srid: number;
  readonly hasZ: boolean;
  readonly coordinates: unknown;
}

interface GoldenManifest {
  readonly schemaVersion: number;
  readonly fixtures: readonly GoldenFixtureEntry[];
}

interface ComplianceDatasetRequirement {
  readonly name: string;
  readonly kind: string;
  readonly minimumFeatureCount: number;
  readonly expectedFieldTypes?: readonly FieldType[];
}

interface ComplianceFixtureEntry {
  readonly id: string;
  readonly path: string;
  readonly requiredDatasets: readonly ComplianceDatasetRequirement[];
  readonly requiredFieldTypes: readonly FieldType[];
}

interface ComplianceManifest {
  readonly schemaVersion: number;
  readonly fixtures: readonly ComplianceFixtureEntry[];
}

interface RoundtripFixtureEntry extends ComplianceFixtureEntry {
  readonly producer: {
    readonly implementation: string;
  };
}

interface RoundtripManifest {
  readonly schemaVersion: number;
  readonly fixtures: readonly RoundtripFixtureEntry[];
}

interface SourceDerivedFixtureEntry {
  readonly id: string;
  readonly path: string;
  readonly tier: string;
  readonly stability: string;
  readonly licenseStatus: string;
  readonly licenseDocument: string;
  readonly generator: {
    readonly product: string;
    readonly productVersion: string;
  };
}

interface SourceDerivedManifest {
  readonly schemaVersion: number;
  readonly fixtures: readonly SourceDerivedFixtureEntry[];
}

type GaiaGeometry = PointGeometry | MultiLineStringGeometry | MultiPolygonGeometry;
type RoundtripDatasetKind =
  | "point"
  | "line"
  | "region"
  | "pointZ"
  | "lineZ"
  | "regionZ"
  | "tabular"
  | "text"
  | "cad";

interface RoundtripDatasetSnapshot {
  readonly info: DatasetInfo;
  readonly fields: readonly FieldInfo[];
  readonly records: readonly (Feature | TabularRecord)[];
}

function isGaiaGeometry(geometry: Geometry): geometry is GaiaGeometry {
  return (
    geometry.type === "Point" ||
    geometry.type === "MultiLineString" ||
    geometry.type === "MultiPolygon"
  );
}

function normalizeGeometry(geometry: GaiaGeometry): unknown {
  return {
    type: geometry.type,
    coordinates: geometry.coordinates,
    srid: geometry.srid ?? null,
    hasZ: geometry.hasZ ?? false,
    geoType: geometry.geoType ?? null
  };
}

function normalizeRecord(record: Feature | TabularRecord): unknown {
  if ("geometry" in record) {
    const geometry = record.geometry;
    return {
      id: record.id,
      geometry: isGaiaGeometry(geometry)
        ? normalizeGeometry(geometry)
        : geometry,
      attributes: record.attributes
    };
  }

  return {
    id: record.id,
    attributes: record.attributes
  };
}

function normalizeFields(fields: readonly FieldInfo[]): unknown {
  return fields.map((field) => ({
    name: field.name,
    fieldType: field.fieldType,
    nullable: field.nullable ?? true,
    defaultValue: field.defaultValue ?? null
  }));
}

async function openComplianceDataSource(): Promise<UdbxDataSource> {
  return UdbxDataSource.open({
    driver: new NodeSqliteDriver(),
    target: { kind: "file", path: complianceDbPath }
  });
}

async function assertFixtureContract(
  fixturePath: string,
  fixture: ComplianceFixtureEntry
): Promise<void> {
  const driver = new NodeSqliteDriver();
  const ds = await UdbxDataSource.open({
    driver,
    target: { kind: "file", path: fixturePath }
  });

  try {
    const datasets = await ds.listDatasets();

    for (const required of fixture.requiredDatasets) {
      const datasetInfo = datasets.find((item) => item.name === required.name);
      expect(datasetInfo, required.name).toBeDefined();
      expect(datasetInfo!.kind, required.name).toBe(required.kind);
      expect(datasetInfo!.objectCount, required.name).toBeGreaterThanOrEqual(
        required.minimumFeatureCount
      );

      const dataset = await ds.getDataset(required.name);
      expect(dataset, required.name).not.toBeNull();

      const count = await dataset!.count();
      expect(count, required.name).toBeGreaterThanOrEqual(
        required.minimumFeatureCount
      );

      const fields = await dataset!.getFields();
      const fieldTypes = new Set(fields.map((field) => field.fieldType));

      for (const expectedFieldType of required.expectedFieldTypes ?? []) {
        expect(
          fieldTypes.has(expectedFieldType),
          `${required.name}:${expectedFieldType}`
        ).toBe(true);
      }
    }

    const coveredFieldTypes = new Set<FieldType>();
    for (const required of fixture.requiredDatasets) {
      const dataset = await ds.getDataset(required.name);
      const fields = await dataset!.getFields();
      for (const field of fields) {
        coveredFieldTypes.add(field.fieldType);
      }
    }

    for (const fieldType of fixture.requiredFieldTypes) {
      expect(coveredFieldTypes.has(fieldType), fieldType).toBe(true);
    }

    const pointDataset = await ds.getDataset("test_points");
    const pointFeatures = await pointDataset!.list();
    expect(pointFeatures[0]).toMatchObject({
      id: 1,
      attributes: {
        NAME: "Alpha City",
        CATEGORY: "capital",
        ELEVATION: 39.5
      }
    });

    const lineDataset = await ds.getDataset("test_lines");
    const lineFeatures = await lineDataset!.list();
    expect(lineFeatures[0]).toMatchObject({
      id: 10,
      geometry: { type: "MultiLineString" },
      attributes: {
        NAME: "North Corridor",
        LEVEL: 1,
        LENGTH_KM: 128.4
      }
    });

    const regionDataset = await ds.getDataset("test_regions");
    const regionFeatures = await regionDataset!.list();
    expect(regionFeatures[0]).toMatchObject({
      id: 20,
      geometry: { type: "MultiPolygon" },
      attributes: {
        NAME: "Core Region",
        LEVEL: 3,
        AREA_KM2: 845.6
      }
    });

    const pointZDataset = await ds.getDataset("test_points_z");
    const pointZFeatures = await pointZDataset!.list();
    expect(pointZFeatures[0]).toMatchObject({
      id: 101,
      geometry: {
        type: "Point",
        coordinates: [116.123, 39.456, 12.5],
        hasZ: true
      },
      attributes: {
        NAME: "Alpha Tower",
        CATEGORY: "control",
        ELEVATION: 88.8
      }
    });

    const lineZDataset = await ds.getDataset("test_lines_z");
    const lineZFeatures = await lineZDataset!.list();
    expect(lineZFeatures[0]).toMatchObject({
      id: 110,
      geometry: {
        type: "MultiLineString",
        hasZ: true
      },
      attributes: {
        NAME: "Sky Corridor",
        LEVEL: 5,
        LENGTH_KM: 128.4
      }
    });
    expect((lineZFeatures[0] as Feature).geometry).toMatchObject({
      coordinates: [
        [
          [116.123, 39.456, 12.5],
          [116.8, 39.9, 15.25],
          [117.2, 40.1, 18.75]
        ]
      ]
    });

    const regionZDataset = await ds.getDataset("test_regions_z");
    const regionZFeatures = await regionZDataset!.list();
    expect(regionZFeatures[0]).toMatchObject({
      id: 120,
      geometry: {
        type: "MultiPolygon",
        hasZ: true
      },
      attributes: {
        NAME: "Elevated Region",
        LEVEL: 7,
        AREA_KM2: 845.6
      }
    });
    expect((regionZFeatures[0] as Feature).geometry).toMatchObject({
      coordinates: [
        [
          [
            [116.0, 39.2, 10],
            [117.4, 39.2, 11],
            [117.4, 40.3, 12],
            [116.0, 40.3, 11],
            [116.0, 39.2, 10]
          ]
        ]
      ]
    });

    const tabularDataset = await ds.getDataset("test_tabular");
    const tabularRecords = await tabularDataset!.list();
    expect(tabularRecords).toEqual([
      {
        id: 30,
        attributes: {
          NAME: "config.maxZoom",
          VALUE: 18,
          SCORE: 0.95
        }
      },
      {
        id: 31,
        attributes: {
          NAME: "config.retryCount",
          VALUE: 3,
          SCORE: 0.5
        }
      }
    ]);

    const cadDataset = await ds.getDataset("test_cad");
    const cadFeatures = await cadDataset!.list();
    expect(cadFeatures).toEqual([
      {
        id: 130,
        geometry: {
          type: "CadPoint",
          geoType: 1,
          x: 116.123,
          y: 39.456,
          style: {
            kind: "marker",
            markerStyle: 1,
            markerSize: 20,
            markerAngle: 0,
            markerColor: 255,
            markerWidth: 20,
            markerHeight: 20,
            fillOpaqueRate: 100,
            fillGradientType: 0,
            fillAngle: 0,
            fillCenterOffsetX: 0,
            fillCenterOffsetY: 0,
            fillBackcolor: 16777215
          }
        },
        attributes: {
          NAME: "CAD Point",
          LEVEL: 1
        }
      },
      {
        id: 131,
        geometry: {
          type: "CadLine",
          geoType: 3,
          numSub: 1,
          subPointCounts: [3],
          coordinates: [
            [116.123, 39.456],
            [116.8, 39.9],
            [117.2, 40.1]
          ],
          style: {
            kind: "line",
            lineStyle: 1,
            lineWidth: 1,
            lineColor: 65280
          }
        },
        attributes: {
          NAME: "CAD Line",
          LEVEL: 2
        }
      },
      {
        id: 132,
        geometry: {
          type: "CadRegion",
          geoType: 5,
          numSub: 1,
          subPointCounts: [5],
          coordinates: [
            [116.0, 39.2],
            [117.4, 39.2],
            [117.4, 40.3],
            [116.0, 40.3],
            [116.0, 39.2]
          ],
          style: {
            kind: "fill",
            lineStyle: 1,
            lineWidth: 1,
            lineColor: 0,
            fillStyle: 0,
            fillForecolor: 16711680,
            fillBackcolor: 16777215,
            fillOpaquerate: 100,
            fillGadientType: 0,
            fillAngle: 0,
            fillCenterOffsetX: 0,
            fillCenterOffsetY: 0
          }
        },
        attributes: {
          NAME: "CAD Region",
          LEVEL: 3
        }
      }
    ]);

    if (fixture.requiredDatasets.some((dataset) => dataset.name === "test_text")) {
      const textDataset = await ds.getDataset("test_text");
      const textFeature = (await textDataset!.getById(1)) as {
        readonly id: number;
        readonly geometry: TextGeometry;
        readonly attributes: Record<string, unknown>;
      };
      expect(textFeature).toMatchObject({
        id: 1,
        geometry: {
          type: "Text",
          text: "河南省",
          anchor: [113.165187569688, 33.875453985],
          rotation: 0,
          style: {
            faceName: "宋体",
            fontHeight: 0.406494140625,
            color: { a: 0, b: 0, g: 0, r: 255 },
            backgroundColor: { a: 255, b: 255, g: 255, r: 255 }
          }
        },
        attributes: {
          NAME: "Text Label",
          LEVEL: 1
        }
      });
    }
  } finally {
    await ds.close();
  }
}

async function snapshotDataset(
  ds: UdbxDataSource,
  name: string
): Promise<RoundtripDatasetSnapshot> {
  const info = (await ds.listDatasets()).find((item) => item.name === name);
  expect(info, name).toBeDefined();

  const dataset = await ds.getDataset(name);
  expect(dataset, name).not.toBeNull();

  const fields = await dataset!.getFields();
  const records = await dataset!.list();

  return {
    info: info!,
    fields,
    records
  };
}

async function createWritableDataset(
  ds: UdbxDataSource,
  snapshot: RoundtripDatasetSnapshot
) {
  const kind = snapshot.info.kind as RoundtripDatasetKind;
  const srid = snapshot.info.srid ?? 0;

  switch (kind) {
    case "point":
      return ds.createPointDataset(snapshot.info.name, srid, snapshot.fields);
    case "line":
      return ds.createLineDataset(snapshot.info.name, srid, snapshot.fields);
    case "region":
      return ds.createRegionDataset(snapshot.info.name, srid, snapshot.fields);
    case "pointZ":
      return ds.createPointZDataset(snapshot.info.name, srid, snapshot.fields);
    case "lineZ":
      return ds.createLineZDataset(snapshot.info.name, srid, snapshot.fields);
    case "regionZ":
      return ds.createRegionZDataset(snapshot.info.name, srid, snapshot.fields);
    case "tabular":
      return ds.createTabularDataset(snapshot.info.name, snapshot.fields);
    case "text":
      return ds.createTextDataset(snapshot.info.name, srid, snapshot.fields);
    case "cad":
      return ds.createCadDataset(snapshot.info.name, snapshot.fields);
  }
}

async function copyDataset(
  target: UdbxDataSource,
  snapshot: RoundtripDatasetSnapshot
): Promise<void> {
  const dataset = await createWritableDataset(target, snapshot);
  await dataset.insertMany(snapshot.records as never);
}

function assertRoundtripEquivalent(
  source: RoundtripDatasetSnapshot,
  target: RoundtripDatasetSnapshot
): void {
  expect(target.info.kind, source.info.name).toBe(source.info.kind);
  expect(target.info.objectCount, source.info.name).toBe(source.info.objectCount);
  expect(target.info.srid ?? 0, source.info.name).toBe(source.info.srid ?? 0);
  expect(normalizeFields(target.fields), source.info.name).toEqual(
    normalizeFields(source.fields)
  );
  expect(target.records.map(normalizeRecord), source.info.name).toEqual(
    source.records.map(normalizeRecord)
  );
}

describe("udbx4spec compliance fixtures", () => {
  it("decodes and re-encodes every golden GAIA fixture losslessly", async () => {
    const manifest = JSON.parse(
      await readFile(goldenManifestPath, "utf8")
    ) as GoldenManifest;

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.fixtures.length).toBeGreaterThan(0);

    for (const fixture of manifest.fixtures) {
      const bytes = new Uint8Array(
        await readFile(resolve(goldenRoot, fixture.path))
      );

      const geometry = GaiaGeometryCodec.decode(bytes);
      expect(isGaiaGeometry(geometry), fixture.id).toBe(true);

      expect(normalizeGeometry(geometry as GaiaGeometry)).toEqual({
        type: fixture.geometryType,
        coordinates: fixture.coordinates,
        srid: fixture.srid,
        hasZ: fixture.hasZ,
        geoType: fixture.geoType
      });

      const encoded = GaiaGeometryCodec.encode(geometry, fixture.srid);
      expect(Array.from(encoded), fixture.id).toEqual(Array.from(bytes));
    }
  });

  it("opens compliance.udbx and satisfies the fixture manifest contract", async () => {
    const manifest = JSON.parse(
      await readFile(fixtureManifestPath, "utf8")
    ) as ComplianceManifest;
    const fixture = manifest.fixtures.find(
      (item) => item.path === "compliance.udbx"
    );

    expect(manifest.schemaVersion).toBe(1);
    expect(fixture).toBeDefined();

    await assertFixtureContract(complianceDbPath, fixture!);
  });

  it("reads roundtrip fixtures produced by other implementations", async () => {
    const manifest = JSON.parse(
      await readFile(roundtripManifestPath, "utf8")
    ) as RoundtripManifest;

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.fixtures.length).toBeGreaterThanOrEqual(2);

    for (const fixture of manifest.fixtures) {
      await assertFixtureContract(resolve(roundtripRoot, fixture.path), fixture);
    }
  });

  it("validates stable T3 source-derived manifest and 3D metadata from SampleData.udbx", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(sourceDerivedRoot, "manifest.json"), "utf8")
    ) as SourceDerivedManifest;
    const fixturesById = new Map(manifest.fixtures.map((fixture) => [fixture.id, fixture]));

    for (const id of [
      "sampledata-county-t-smid-1-smgeometry",
      "sampledata-caddt-smid-1-smgeometry",
      "sampledata-caddt-smid-16-smgeometry",
      "sampledata-caddt-smid-63-smgeometry",
      "sampledata-3d-srid-zero-metadata"
    ]) {
      const fixture = fixturesById.get(id);
      expect(fixture).toBeDefined();
      expect(fixture).toMatchObject({
        tier: "T3",
        stability: "stable",
        licenseStatus: "public-confirmed",
        licenseDocument: "docs/samples/licenses/sampledata-public-distribution-confirmation.md",
        generator: {
          product: "SuperMap iDesktopX 2025",
          productVersion: "V12.0.1.0"
        }
      });
    }

    const metadata = JSON.parse(
      await readFile(resolve(sourceDerivedRoot, "sampledata/3d-srid-zero/metadata.json"), "utf8")
    ) as {
      readonly datasets: readonly {
        readonly name: string;
        readonly smSRID: number;
        readonly geometryColumnSRID: number;
        readonly coordDimension: number;
        readonly sampleFeature: { readonly gaiaHeaderSRID: number };
      }[];
    };

    expect(metadata.datasets.map((dataset) => dataset.name)).toEqual([
      "BaseMap_PZ",
      "BaseMap_LZ",
      "BaseMap_RZ"
    ]);
    for (const dataset of metadata.datasets) {
      expect(dataset.smSRID).toBe(0);
      expect(dataset.geometryColumnSRID).toBe(0);
      expect(dataset.coordDimension).toBe(3);
      expect(dataset.sampleFeature.gaiaHeaderSRID).toBe(0);
    }
  });

  it("decodes stable T3 source-derived GeoText bytes from SampleData.udbx", async () => {
    const bytes = new Uint8Array(
      await readFile(
        resolve(sourceDerivedRoot, "sampledata/county-t/smid-1-smgeometry.bin")
      )
    );

    const geometry = GeoTextCodec.decode(bytes);

    expect(geometry).toMatchObject({
      type: "Text",
      anchor: [117.30733958523862, 39.95693237286111],
      rotation: -3.2,
      geoType: 7,
      style: {
        fixedSize: 0,
        weight: 80,
        styleFlag: 0,
        alignFlag: 37,
        fontHeight: 3.7,
        faceName: "����"
      },
      subTexts: [
        {
          text: "����                          ",
          anchor: [117.30733958523862, 39.95693237286111],
          rotation: -3.2
        }
      ]
    });
  });

  it("decodes stable T3 source-derived CAD bytes from SampleData.udbx", async () => {
    const pointBytes = new Uint8Array(
      await readFile(resolve(sourceDerivedRoot, "sampledata/caddt/smid-1-smgeometry.bin"))
    );
    const point = CadGeometryCodec.read(pointBytes);
    expect(point.type).toBe("CadPoint");
    if (point.type === "CadPoint") {
      expect(point.geoType).toBe(1);
      expect(point.x).toBeCloseTo(117.39993002089763, 10);
      expect(point.y).toBeCloseTo(40.0590434404585, 10);
      expect(point.style).toBeUndefined();
    }

    const lineBytes = new Uint8Array(
      await readFile(resolve(sourceDerivedRoot, "sampledata/caddt/smid-16-smgeometry.bin"))
    );
    const line = CadGeometryCodec.read(lineBytes);
    expect(line.type).toBe("CadLine");
    if (line.type === "CadLine") {
      expect(line.geoType).toBe(3);
      expect(line.numSub).toBe(1);
      expect(line.subPointCounts).toEqual([17]);
      expect(line.coordinates[0]).toEqual([116.68328592226102, 40.995215339741925]);
      expect(line.coordinates[line.coordinates.length - 1]).toEqual([116.36793930503393, 40.89292722915481]);
      expect(line.style).toBeUndefined();
    }

    const regionBytes = new Uint8Array(
      await readFile(resolve(sourceDerivedRoot, "sampledata/caddt/smid-63-smgeometry.bin"))
    );
    const region = CadGeometryCodec.read(regionBytes);
    expect(region.type).toBe("CadRegion");
    if (region.type === "CadRegion") {
      expect(region.geoType).toBe(5);
      expect(region.numSub).toBe(1);
      expect(region.subPointCounts).toEqual([120]);
      expect(region.coordinates[0]).toEqual([116.65601002454922, 41.03663585095796]);
      expect(region.coordinates[region.coordinates.length - 1]).toEqual([116.65601002454922, 41.03663585095796]);
      expect(region.style).toBeUndefined();
    }
  });

  it("roundtrips compliance.udbx semantically with the TypeScript implementation", async () => {
    const datasetNames = [
      "test_points",
      "test_lines",
      "test_regions",
      "test_points_z",
      "test_lines_z",
      "test_regions_z",
      "test_tabular",
      "test_text",
      "test_cad"
    ] as const;
    const tempDir = await mkdtemp(join(tmpdir(), "udbx4ts-roundtrip-"));
    const roundtripPath = join(tempDir, "roundtrip.udbx");

    try {
      const source = await openComplianceDataSource();
      const snapshots = new Map<string, RoundtripDatasetSnapshot>();

      try {
        for (const name of datasetNames) {
          snapshots.set(name, await snapshotDataset(source, name));
        }
      } finally {
        await source.close();
      }

      const target = await UdbxDataSource.create({
        driver: new NodeSqliteDriver(),
        target: { kind: "file", path: roundtripPath }
      });

      try {
        for (const snapshot of snapshots.values()) {
          await copyDataset(target, snapshot);
        }
      } finally {
        await target.close();
      }

      const reopened = await UdbxDataSource.open({
        driver: new NodeSqliteDriver(),
        target: { kind: "file", path: roundtripPath }
      });

      try {
        for (const name of datasetNames) {
          assertRoundtripEquivalent(
            snapshots.get(name)!,
            await snapshotDataset(reopened, name)
          );
        }
      } finally {
        await reopened.close();
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
