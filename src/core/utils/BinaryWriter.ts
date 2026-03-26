export class BinaryWriter {
  private buffer: ArrayBuffer;
  private view: DataView;
  private bytes: Uint8Array;
  private offset = 0;

  constructor(initialCapacity = 64) {
    if (initialCapacity <= 0) {
      throw new RangeError("Initial capacity must be greater than 0.");
    }

    this.buffer = new ArrayBuffer(initialCapacity);
    this.view = new DataView(this.buffer);
    this.bytes = new Uint8Array(this.buffer);
  }

  get length(): number {
    return this.offset;
  }

  writeUint8(value: number): void {
    this.ensureCapacity(1);
    this.view.setUint8(this.offset, value);
    this.offset += 1;
  }

  writeInt32(value: number, littleEndian = true): void {
    this.ensureCapacity(4);
    this.view.setInt32(this.offset, value, littleEndian);
    this.offset += 4;
  }

  writeFloat64(value: number, littleEndian = true): void {
    this.ensureCapacity(8);
    this.view.setFloat64(this.offset, value, littleEndian);
    this.offset += 8;
  }

  writeBytes(value: ArrayBuffer | ArrayBufferView | Uint8Array): void {
    const bytes = value instanceof Uint8Array
      ? value
      : ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        : new Uint8Array(value);

    this.ensureCapacity(bytes.byteLength);
    this.bytes.set(bytes, this.offset);
    this.offset += bytes.byteLength;
  }

  toUint8Array(): Uint8Array {
    return this.bytes.slice(0, this.offset);
  }

  private ensureCapacity(required: number): void {
    if (this.offset + required <= this.buffer.byteLength) {
      return;
    }

    let nextCapacity = this.buffer.byteLength;
    while (this.offset + required > nextCapacity) {
      nextCapacity *= 2;
    }

    const nextBuffer = new ArrayBuffer(nextCapacity);
    const nextBytes = new Uint8Array(nextBuffer);
    nextBytes.set(this.bytes.subarray(0, this.offset));

    this.buffer = nextBuffer;
    this.view = new DataView(this.buffer);
    this.bytes = nextBytes;
  }
}

