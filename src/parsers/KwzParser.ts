import { 
  FlipnoteFormat,
  FlipnotePaletteDefinition,
  FlipnoteAudioTrack,
  FlipnoteMeta,
  FlipnoteParser
} from './FlipnoteParserTypes';

import {
  clamp,
  pcmDsAudioResample,
  pcmGetClippingRatio,
  ADPCM_STEP_TABLE,
  ADPCM_INDEX_TABLE_2BIT,
  ADPCM_INDEX_TABLE_4BIT
} from './audioUtils';

import {
  assert,
  dateFromNintendoTimestamp,
  timeGetNoteDuration
} from '../utils';

/** 
 * KWZ framerates in frames per second, indexed by the in-app frame speed
 */
const KWZ_FRAMERATES = [.2, .5, 1, 2, 4, 6, 8, 12, 20, 24, 30];
/** 
 * KWZ color defines (red, green, blue, alpha)
 */
const KWZ_PALETTE: FlipnotePaletteDefinition = {
  WHITE:  [0xff, 0xff, 0xff, 0xff],
  BLACK:  [0x10, 0x10, 0x10, 0xff],
  RED:    [0xff, 0x10, 0x10, 0xff],
  YELLOW: [0xff, 0xe7, 0x00, 0xff],
  GREEN:  [0x00, 0x86, 0x31, 0xff],
  BLUE:   [0x00, 0x38, 0xce, 0xff],
  NONE:   [0xff, 0xff, 0xff, 0x00]
};

/** 
 * Pre computed bitmasks for readBits; done as a slight optimisation
 * @internal
 */
const BITMASKS = new Uint16Array(16);
for (let i = 0; i < 16; i++) {
  BITMASKS[i] = (1 << i) - 1;
}

/** 
 * Every possible sequence of pixels for each 8-pixel line
 * @internal 
 */
const KWZ_LINE_TABLE = new Uint8Array(6561 * 8);
/** 
 * Same lines as KWZ_LINE_TABLE, but the pixels are shift-rotated to the left by one place
 * @internal
 */
const KWZ_LINE_TABLE_SHIFT = new Uint8Array(6561 * 8);

/** @internal */
var offset = 0;
for (let a = 0; a < 3; a++)
for (let b = 0; b < 3; b++)
for (let c = 0; c < 3; c++)
for (let d = 0; d < 3; d++)
for (let e = 0; e < 3; e++)
for (let f = 0; f < 3; f++)
for (let g = 0; g < 3; g++)
for (let h = 0; h < 3; h++)
{
  KWZ_LINE_TABLE.set([b, a, d, c, f, e, h, g], offset);
  KWZ_LINE_TABLE_SHIFT.set([a, d, c, f, e, h, g, b], offset);
  offset += 8;
}

/**
 * Commonly used lines - represents lines where all the pixels are empty, full, 
 * or include a pattern produced by the paint tool, etc
 * @internal
 */
const KWZ_LINE_TABLE_COMMON = new Uint8Array(32 * 8);
/** 
 * Same lines as common line table, but shift-rotates one place to the left
 * @internal
 */
const KWZ_LINE_TABLE_COMMON_SHIFT = new Uint8Array(32 * 8);

[
  0x0000, 0x0CD0, 0x19A0, 0x02D9, 0x088B, 0x0051, 0x00F3, 0x0009,
  0x001B, 0x0001, 0x0003, 0x05B2, 0x1116, 0x00A2, 0x01E6, 0x0012,
  0x0036, 0x0002, 0x0006, 0x0B64, 0x08DC, 0x0144, 0x00FC, 0x0024,
  0x001C, 0x0004, 0x0334, 0x099C, 0x0668, 0x1338, 0x1004, 0x166C
].forEach((value, i) => {
  const lineTablePtr = value * 8;
  const pixels = KWZ_LINE_TABLE.subarray(lineTablePtr, lineTablePtr + 8);
  const shiftPixels = KWZ_LINE_TABLE_SHIFT.subarray(lineTablePtr, lineTablePtr + 8);
  KWZ_LINE_TABLE_COMMON.set(pixels, i * 8);
  KWZ_LINE_TABLE_COMMON_SHIFT.set(shiftPixels, i * 8);
});

/** 
 * KWZ section types
 * @internal
 */
export type KwzSectionMagic = 'KFH' | 'KTN' | 'KMC' | 'KMI' | 'KSN' | 'ICO';

/** 
 * KWZ section map, tracking their offset and length
 * @internal
 */
export type KwzSectionMap = Map<KwzSectionMagic, {
  ptr: number, 
  length: number
}>;

/** 
 * KWZ file metadata, stores information about its playback, author details, etc
 */
export interface KwzMeta extends FlipnoteMeta {
  /** Date representing when the file was created */
  creationTimestamp: Date;
};

/** 
 * KWZ frame metadata, stores information about each frame, like layer depths sound effect usage
 */
export interface KwzFrameMeta {
  /** Frame flags */
  flags: number[];
  /** Frame layer sizes */
  layerSize: number[];
  /** Frame author's Flipnote Studio ID */
  frameAuthor: string;
  /** Frame layer 3D depths */
  layerDepth: number[];
  /** Frame sound */
  soundFlags: number;
  /** Whether this frame contains photos taken with the console's camera */
  cameraFlag: number;
};

/** 
 * KWZ parser options for enabling optimisations and other extra features
 */
export interface KwzParserSettings {
  /** 
   * Skip full metadata parsing for quickness
   */
  quickMeta: boolean;
  /** 
   * Apply special cases for DSi library notes
   */ 
  dsiLibraryNote: boolean;
  /** 
   * Flipnote 3D's own implementation is slightly buggy. 
   * Enable this to use a more "correct" audio decoding setup that may produce cleaner audio for most 3DS notes
   */
  cleanerAudio: boolean;
};

/** 
 * Parser class for Flipnote Studio 3D's KWZ animation format
 * 
 * KWZ format docs: https://github.com/Flipnote-Collective/flipnote-studio-3d-docs/wiki/KWZ-Format
 * @category File Parser
 */
export class KwzParser extends FlipnoteParser {

  /** Default KWZ parser settings */
  static defaultSettings: KwzParserSettings = {
    quickMeta: false,
    dsiLibraryNote: false,
    cleanerAudio: false
  };
  /** File format type */
  static format = FlipnoteFormat.KWZ;
  /** Animation frame width */
  static width = 320;
  /** Animation frame height */
  static height = 240;
  /** Number of animation frame layers */
  static numLayers = 3;
  /** Audio track base sample rate */
  static rawSampleRate = 16364;
  /** Audio output sample rate. NOTE: probably isn't accurate, full KWZ audio stack is still on the todo */
  static sampleRate = 16364;
  /** Global animation frame color palette */
  static globalPalette = [
    KWZ_PALETTE.WHITE,
    KWZ_PALETTE.BLACK,
    KWZ_PALETTE.RED,
    KWZ_PALETTE.YELLOW,
    KWZ_PALETTE.GREEN,
    KWZ_PALETTE.BLUE,
    KWZ_PALETTE.NONE,
  ];
  
  /** File format type, reflects {@link KwzParser.format} */
  public format = FlipnoteFormat.KWZ;
  /** Animation frame width, reflects {@link KwzParser.width} */
  public width = KwzParser.width;
  /** Animation frame height, reflects {@link KwzParser.height} */
  public height = KwzParser.height;
  /** Number of animation frame layers, reflects {@link KwzParser.numLayers} */
  public numLayers = KwzParser.numLayers;
  /** Audio track base sample rate, reflects {@link KwzParser.rawSampleRate} */
  public rawSampleRate = KwzParser.rawSampleRate;
  /** Audio output sample rate, reflects {@link KwzParser.sampleRate} */
  public sampleRate = KwzParser.sampleRate;
  /** Global animation frame color palette, reflects {@link KwzParser.globalPalette} */
  public globalPalette = KwzParser.globalPalette;
  /** File metadata, see {@link KwzMeta} for structure */
  public meta: KwzMeta;

  private settings: KwzParserSettings;
  private sectionMap: KwzSectionMap;
  private layers: [Uint8Array, Uint8Array, Uint8Array];
  private prevFrameIndex: number = null;
  private frameMeta: Map<number, KwzFrameMeta>;
  private frameMetaOffsets: Uint32Array;
  private frameDataOffsets: Uint32Array;
  private frameLayerSizes: [number, number, number][];
  private bitIndex = 0;
  private bitValue = 0;

  /**
   * Create a new KWZ file parser instance
   * @param arrayBuffer an ArrayBuffer containing file data
   * @param settings parser settings
   */
  constructor(arrayBuffer: ArrayBuffer, settings: Partial<KwzParserSettings> = {}) {
    super(arrayBuffer);
    this.settings = {...KwzParser.defaultSettings, ...settings};
    this.layers = [
      new Uint8Array(KwzParser.width * KwzParser.height),
      new Uint8Array(KwzParser.width * KwzParser.height),
      new Uint8Array(KwzParser.width * KwzParser.height),
    ];
    this.buildSectionMap();
    if (!this.settings.quickMeta)
      this.decodeMeta();
    else
      this.decodeMetaQuick();
    this.getFrameOffsets();
    this.decodeSoundHeader();
  }
  
  private buildSectionMap() {
    this.seek(0);
    const fileSize = this.byteLength - 256;
    const sectionMap = new Map();
    let sectionCount = 0;
    let ptr = 0;
    // counting sections should mitigate against one of mrnbayoh's notehax exploits
    while ((ptr < fileSize) && (sectionCount < 6)) {
      this.seek(ptr);
      const magic = this.readChars(4).substring(0, 3) as KwzSectionMagic;
      const length = this.readUint32();
      sectionMap.set(magic, { ptr, length });
      ptr += length + 8;
      sectionCount += 1;
    }
    this.sectionMap = sectionMap;
    assert(sectionMap.has('KMC') && sectionMap.has('KMI'));
  }

  private readBits(num: number) {
    // assert(num < 16);
    if (this.bitIndex + num > 16) {
      const nextBits = this.readUint16();
      this.bitValue |= nextBits << (16 - this.bitIndex);
      this.bitIndex -= 16;
    }
    const result = this.bitValue & BITMASKS[num];
    this.bitValue >>= num;
    this.bitIndex += num;
    return result;
  }

  private readFsid() {
    if (this.settings.dsiLibraryNote) { // format as DSi PPM FSID
      const hex = this.readHex(10, true);
      return hex.slice(2, 18);
    }
    const hex = this.readHex(10);
    return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 18)}`.toLowerCase();
  }

  private readFilename() {
    const ptr = this.pointer;
    const chars = this.readChars(28);
    if (chars.length === 28)
      return chars;
    // Otherwise, this is likely a DSi Library note, 
    // where sometimes Nintendo's buggy PPM converter includes the original packed PPM filename
    this.seek(ptr);
    const mac = this.readHex(3);
    const random = this.readChars(13);
    const edits = this.readUint16().toString().padStart(3, '0');
    this.seek(ptr + 28);
    return `${ mac }_${ random }_${ edits }`;
  }

  private decodeMeta() {
    assert(this.sectionMap.has('KFH'));
    this.seek(this.sectionMap.get('KFH').ptr + 12);
    const creationTime = dateFromNintendoTimestamp(this.readUint32());
    const modifiedTime = dateFromNintendoTimestamp(this.readUint32());
    // const simonTime = 
    const appVersion = this.readUint32();
    const rootAuthorId = this.readFsid();
    const parentAuthorId = this.readFsid();
    const currentAuthorId = this.readFsid();
    const rootAuthorName = this.readWideChars(11);
    const parentAuthorName = this.readWideChars(11);
    const currentAuthorName = this.readWideChars(11);
    const rootFilename = this.readFilename();
    const parentFilename = this.readFilename();
    const currentFilename = this.readFilename();
    const frameCount = this.readUint16();
    const thumbIndex = this.readUint16();
    const flags = this.readUint16();
    const frameSpeed = this.readUint8();
    const layerFlags = this.readUint8();
    this.isSpinoff = (currentAuthorId !== parentAuthorId) || (currentAuthorId !== rootAuthorId);
    this.frameCount = frameCount;
    this.frameSpeed = frameSpeed;
    this.framerate = KWZ_FRAMERATES[frameSpeed];
    this.duration = timeGetNoteDuration(this.frameCount, this.framerate);
    this.thumbFrameIndex = thumbIndex;
    this.layerVisibility = {
      1: (layerFlags & 0x1) === 0,
      2: (layerFlags & 0x2) === 0,
      3: (layerFlags & 0x3) === 0,
    };
    this.meta = {
      lock: (flags & 0x1) !== 0,
      loop: (flags & 0x2) !== 0,
      isSpinoff: this.isSpinoff,
      frameCount: frameCount,
      frameSpeed: frameSpeed,
      duration: this.duration,
      thumbIndex: thumbIndex,
      timestamp: modifiedTime,
      creationTimestamp: creationTime,
      root: {
        username: rootAuthorName,
        fsid: rootAuthorId,
        filename: rootFilename,
        isDsiFilename: rootFilename.length !== 28
      },
      parent: {
        username: parentAuthorName,
        fsid: parentAuthorId,
        filename: parentFilename,
        isDsiFilename: parentFilename.length !== 28
      },
      current: {
        username: currentAuthorName,
        fsid: currentAuthorId,
        filename: currentFilename,
        isDsiFilename: currentFilename.length !== 28
      },
    };
  }

  private decodeMetaQuick() {
    assert(this.sectionMap.has('KFH'));
    this.seek(this.sectionMap.get('KFH').ptr + 0x8 + 0xC4);
    const frameCount = this.readUint16();
    const thumbFrameIndex = this.readUint16();
    const flags = this.readUint16();
    const frameSpeed = this.readUint8();
    const layerFlags = this.readUint8();
    this.frameCount = frameCount;
    this.thumbFrameIndex = thumbFrameIndex;
    this.frameSpeed = frameSpeed;
    this.framerate = KWZ_FRAMERATES[frameSpeed];
    this.duration = timeGetNoteDuration(this.frameCount, this.framerate);
    this.layerVisibility = {
      1: (layerFlags & 0x1) === 0,
      2: (layerFlags & 0x2) === 0,
      3: (layerFlags & 0x3) === 0,
    };
  }

  private getFrameOffsets() {
    assert(this.sectionMap.has('KMI') && this.sectionMap.has('KMC'));
    const numFrames = this.frameCount;
    const kmiSection = this.sectionMap.get('KMI');
    const kmcSection = this.sectionMap.get('KMC');
    assert(kmiSection.length / 28 >= numFrames);
    const frameMetaOffsets = new Uint32Array(numFrames);
    const frameDataOffsets = new Uint32Array(numFrames);
    const frameLayerSizes: [number, number, number][] = [];
    let frameMetaPtr = kmiSection.ptr + 8;
    let frameDataPtr = kmcSection.ptr + 12;
    for (let frameIndex = 0; frameIndex < numFrames; frameIndex++) {
      this.seek(frameMetaPtr + 4);
      const layerASize = this.readUint16();
      const layerBSize = this.readUint16();
      const layerCSize = this.readUint16();
      frameMetaOffsets[frameIndex] = frameMetaPtr
      frameDataOffsets[frameIndex] = frameDataPtr;
      frameMetaPtr += 28;
      frameDataPtr += layerASize + layerBSize + layerCSize;
      assert(frameMetaPtr < this.byteLength, `frame${ frameIndex } meta pointer out of bounds`);
      assert(frameDataPtr < this.byteLength, `frame${ frameIndex } data pointer out of bounds`);
      frameLayerSizes.push([layerASize, layerBSize, layerCSize]);
    }
    this.frameMetaOffsets = frameMetaOffsets;
    this.frameDataOffsets = frameDataOffsets;
    this.frameLayerSizes = frameLayerSizes;
  }

  private decodeSoundHeader() {
    assert(this.sectionMap.has('KSN'));
    let ptr = this.sectionMap.get('KSN').ptr + 8;
    this.seek(ptr);
    this.bgmSpeed = this.readUint32();
    assert(this.bgmSpeed <= 10);
    this.bgmrate = KWZ_FRAMERATES[this.bgmSpeed];
    const trackSizes = new Uint32Array(this.buffer, ptr + 4, 20);
    this.soundMeta = {
      [FlipnoteAudioTrack.BGM]: {ptr: ptr += 28,            length: trackSizes[0]},
      [FlipnoteAudioTrack.SE1]: {ptr: ptr += trackSizes[0], length: trackSizes[1]},
      [FlipnoteAudioTrack.SE2]: {ptr: ptr += trackSizes[1], length: trackSizes[2]},
      [FlipnoteAudioTrack.SE3]: {ptr: ptr += trackSizes[2], length: trackSizes[3]},
      [FlipnoteAudioTrack.SE4]: {ptr: ptr += trackSizes[3], length: trackSizes[4]},
    };
  }

  /** 
   * Get the color palette indices for a given frame. RGBA colors for these values can be indexed from {@link KwzParser.globalPalette}
   * 
   * Returns an array where:
   *  - index 0 is the paper color index
   *  - index 1 is the layer A color 1 index
   *  - index 2 is the layer A color 2 index
   *  - index 3 is the layer B color 1 index
   *  - index 4 is the layer B color 2 index
   *  - index 5 is the layer C color 1 index
   *  - index 6 is the layer C color 2 index
   * @category Image
  */
  public getFramePaletteIndices(frameIndex: number) {
    this.seek(this.frameMetaOffsets[frameIndex]);
    const flags = this.readUint32();
    return [
      flags & 0xF,
      (flags >> 8) & 0xF,
      (flags >> 12) & 0xF,
      (flags >> 16) & 0xF,
      (flags >> 20) & 0xF,
      (flags >> 24) & 0xF,
      (flags >> 28) & 0xF,
    ];
  }

  /**
   * Get the RGBA colors for a given frame
   * 
   * Returns an array where:
   *  - index 0 is the paper color
   *  - index 1 is the layer A color 1
   *  - index 2 is the layer A color 2
   *  - index 3 is the layer B color 1
   *  - index 4 is the layer B color 2
   *  - index 5 is the layer C color 1
   *  - index 6 is the layer C color 2
   * @category Image
  */
  public getFramePalette(frameIndex: number) {
    const indices = this.getFramePaletteIndices(frameIndex);
    return indices.map(colorIndex => this.globalPalette[colorIndex]);
  }

  private getFrameDiffingFlag(frameIndex: number) {
    this.seek(this.frameMetaOffsets[frameIndex]);
    const flags = this.readUint32();
    return (flags >> 4) & 0x07;
  }

  private getFrameLayerSizes(frameIndex: number) {
    this.seek(this.frameMetaOffsets[frameIndex] + 0x4);
    return [
      this.readUint16(),
      this.readUint16(),
      this.readUint16()
    ];
  }

  private getFrameLayerDepths(frameIndex: number) {
    this.seek(this.frameMetaOffsets[frameIndex] + 0x14);
    return [
      this.readUint8(),
      this.readUint8(),
      this.readUint8()
    ];
  }

  private getFrameAuthor(frameIndex: number) {
    this.seek(this.frameMetaOffsets[frameIndex] + 0xA);
    return this.readHex(10);
  }

  private getFrameSoundFlags(frameIndex: number) {
    this.seek(this.frameMetaOffsets[frameIndex] + 0x17);
    const soundFlags = this.readUint8();
    return [
      (soundFlags & 0x1) !== 0,
      (soundFlags & 0x2) !== 0,
      (soundFlags & 0x4) !== 0,
      (soundFlags & 0x8) !== 0,
    ];
  }

  private getFrameCameraFlags(frameIndex: number) {
    this.seek(this.frameMetaOffsets[frameIndex] + 0x1A);
    const cameraFlags = this.readUint8();
    return [
      (cameraFlags & 0x1) !== 0,
      (cameraFlags & 0x2) !== 0,
      (cameraFlags & 0x4) !== 0,
    ];
  }

  /** 
   * Get the layer draw order for a given frame
   * @category Image
   * @returns Array of layer indexes, in the order they should be drawn
  */
  public getFrameLayerOrder(frameIndex: number) {
    const depths = this.getFrameLayerDepths(frameIndex);
    return [2, 1, 0].sort((a, b) => depths[b] - depths[a]);
  }

  /** 
   * Decode a frame, returning the raw pixel buffers for each layer
   * @category Image
  */
  public decodeFrame(frameIndex: number, diffingFlag = 0x7, isPrevFrame = false) {
    assert(frameIndex > -1 && frameIndex < this.frameCount, `Frame index ${ frameIndex } out of bounds`);
    // the prevDecodedFrame check is an optimisation for decoding frames in full sequence
    if (this.prevFrameIndex !== frameIndex - 1 && frameIndex !== 0) {
      // if this frame is being decoded as a prev frame, then we only want to decode the layers necessary
      // diffingFlag is negated with ~ so if no layers are diff-based, diffingFlag is 0
      if (isPrevFrame)
        diffingFlag = diffingFlag & ~this.getFrameDiffingFlag(frameIndex + 1);
      // if diffing flag isn't 0, decode the previous frame before this one
      if (diffingFlag !== 0)
        this.decodeFrame(frameIndex - 1, diffingFlag, true);
    }
    
    let framePtr = this.frameDataOffsets[frameIndex];
    const layerSizes = this.frameLayerSizes[frameIndex];

    for (let layerIndex = 0; layerIndex < 3; layerIndex++) {
      // dsi gallery conversions don't use the third layer, so it can be skipped if this is set
      if (this.settings.dsiLibraryNote && layerIndex === 3)
        break;

      this.seek(framePtr);
      let layerSize = layerSizes[layerIndex];
      framePtr += layerSize;
      const pixelBuffer = this.layers[layerIndex];

      // if the layer is 38 bytes then it hasn't changed at all since the previous frame, so we can skip it
      if (layerSize === 38)
        continue;

      // if this layer doesn't need to be decoded for diffing
      if (((diffingFlag >> layerIndex) & 0x1) === 0)
        continue;

      // reset readbits state
      this.bitIndex = 16;
      this.bitValue = 0;

      // tile skip counter
      let skipTileCounter = 0;

      for (let tileOffsetY = 0; tileOffsetY < 240; tileOffsetY += 128) {
        for (let tileOffsetX = 0; tileOffsetX < 320; tileOffsetX += 128) {
          // loop small tiles
          for (let subTileOffsetY = 0; subTileOffsetY < 128; subTileOffsetY += 8) {
            const y = tileOffsetY + subTileOffsetY;
            if (y >= 240)
              break;

            for (let subTileOffsetX = 0; subTileOffsetX < 128; subTileOffsetX += 8) {
              const x = tileOffsetX + subTileOffsetX;
              if (x >= 320)
                break;

              // continue to next tile loop if skipTileCounter is > 0
              if (skipTileCounter > 0) {
                skipTileCounter -= 1;
                continue;
              }

              let pixelBufferPtr = y * KwzParser.width + x;
              const tileType = this.readBits(3);

              if (tileType === 0) {
                const linePtr = this.readBits(5) * 8;
                const pixels = KWZ_LINE_TABLE_COMMON.subarray(linePtr, linePtr + 8);
                pixelBuffer.set(pixels, pixelBufferPtr);
                pixelBuffer.set(pixels, pixelBufferPtr += 320);
                pixelBuffer.set(pixels, pixelBufferPtr += 320);
                pixelBuffer.set(pixels, pixelBufferPtr += 320);
                pixelBuffer.set(pixels, pixelBufferPtr += 320);
                pixelBuffer.set(pixels, pixelBufferPtr += 320);
                pixelBuffer.set(pixels, pixelBufferPtr += 320);
                pixelBuffer.set(pixels, pixelBufferPtr += 320);
              } 

              else if (tileType === 1) {
                const linePtr = this.readBits(13) * 8;
                const pixels = KWZ_LINE_TABLE.subarray(linePtr, linePtr + 8);
                pixelBuffer.set(pixels, pixelBufferPtr);
                pixelBuffer.set(pixels, pixelBufferPtr += 320);
                pixelBuffer.set(pixels, pixelBufferPtr += 320);
                pixelBuffer.set(pixels, pixelBufferPtr += 320);
                pixelBuffer.set(pixels, pixelBufferPtr += 320);
                pixelBuffer.set(pixels, pixelBufferPtr += 320);
                pixelBuffer.set(pixels, pixelBufferPtr += 320);
                pixelBuffer.set(pixels, pixelBufferPtr += 320);
              } 
              
              else if (tileType === 2) {
                const linePtr = this.readBits(5) * 8;
                const a = KWZ_LINE_TABLE_COMMON.subarray(linePtr, linePtr + 8);
                const b = KWZ_LINE_TABLE_COMMON_SHIFT.subarray(linePtr, linePtr + 8);
                pixelBuffer.set(a, pixelBufferPtr);
                pixelBuffer.set(b, pixelBufferPtr += 320);
                pixelBuffer.set(a, pixelBufferPtr += 320);
                pixelBuffer.set(b, pixelBufferPtr += 320);
                pixelBuffer.set(a, pixelBufferPtr += 320);
                pixelBuffer.set(b, pixelBufferPtr += 320);
                pixelBuffer.set(a, pixelBufferPtr += 320);
                pixelBuffer.set(b, pixelBufferPtr += 320);
              } 
              
              else if (tileType === 3) {
                const linePtr = this.readBits(13) * 8;
                const a = KWZ_LINE_TABLE.subarray(linePtr, linePtr + 8);
                const b = KWZ_LINE_TABLE_SHIFT.subarray(linePtr, linePtr + 8);
                pixelBuffer.set(a, pixelBufferPtr);
                pixelBuffer.set(b, pixelBufferPtr += 320);
                pixelBuffer.set(a, pixelBufferPtr += 320);
                pixelBuffer.set(b, pixelBufferPtr += 320);
                pixelBuffer.set(a, pixelBufferPtr += 320);
                pixelBuffer.set(b, pixelBufferPtr += 320);
                pixelBuffer.set(a, pixelBufferPtr += 320);
                pixelBuffer.set(b, pixelBufferPtr += 320);
              }

              // most common tile type
              else if (tileType === 4) {
                const flags = this.readBits(8);
                for (let mask = 1; mask < 0xFF; mask <<= 1) {
                  if (flags & mask) {
                    const linePtr = this.readBits(5) * 8;
                    const pixels = KWZ_LINE_TABLE_COMMON.subarray(linePtr, linePtr + 8);
                    pixelBuffer.set(pixels, pixelBufferPtr);
                  }
                  else {
                    const linePtr = this.readBits(13) * 8;
                    const pixels = KWZ_LINE_TABLE.subarray(linePtr, linePtr + 8);
                    pixelBuffer.set(pixels, pixelBufferPtr);
                  }
                  pixelBufferPtr += 320;
                }
              }

              else if (tileType === 5) {
                skipTileCounter = this.readBits(5);
                continue;
              }

              // type 6 doesnt exist

              else if (tileType === 7) {
                let pattern = this.readBits(2);
                let useCommonLines = this.readBits(1);
                let a, b;

                if (useCommonLines !== 0) {
                  const linePtrA = this.readBits(5) * 8;
                  const linePtrB = this.readBits(5) * 8;
                  a = KWZ_LINE_TABLE_COMMON.subarray(linePtrA, linePtrA + 8);
                  b = KWZ_LINE_TABLE_COMMON.subarray(linePtrB, linePtrB + 8);
                  pattern = (pattern + 1) % 4;
                } else {
                  const linePtrA = this.readBits(13) * 8;
                  const linePtrB = this.readBits(13) * 8;
                  a = KWZ_LINE_TABLE.subarray(linePtrA, linePtrA + 8);
                  b = KWZ_LINE_TABLE.subarray(linePtrB, linePtrB + 8);
                }

                if (pattern === 0) {
                  pixelBuffer.set(a, pixelBufferPtr);
                  pixelBuffer.set(b, pixelBufferPtr += 320);
                  pixelBuffer.set(a, pixelBufferPtr += 320);
                  pixelBuffer.set(b, pixelBufferPtr += 320);
                  pixelBuffer.set(a, pixelBufferPtr += 320);
                  pixelBuffer.set(b, pixelBufferPtr += 320);
                  pixelBuffer.set(a, pixelBufferPtr += 320);
                  pixelBuffer.set(b, pixelBufferPtr += 320);
                } else if (pattern === 1) {
                  pixelBuffer.set(a, pixelBufferPtr);
                  pixelBuffer.set(a, pixelBufferPtr += 320);
                  pixelBuffer.set(b, pixelBufferPtr += 320);
                  pixelBuffer.set(a, pixelBufferPtr += 320);
                  pixelBuffer.set(a, pixelBufferPtr += 320);
                  pixelBuffer.set(b, pixelBufferPtr += 320);
                  pixelBuffer.set(a, pixelBufferPtr += 320);
                  pixelBuffer.set(a, pixelBufferPtr += 320);
                } else if (pattern === 2) {
                  pixelBuffer.set(a, pixelBufferPtr);
                  pixelBuffer.set(b, pixelBufferPtr += 320);
                  pixelBuffer.set(a, pixelBufferPtr += 320);
                  pixelBuffer.set(a, pixelBufferPtr += 320);
                  pixelBuffer.set(b, pixelBufferPtr += 320);
                  pixelBuffer.set(a, pixelBufferPtr += 320);
                  pixelBuffer.set(a, pixelBufferPtr += 320);
                  pixelBuffer.set(b, pixelBufferPtr += 320);
                } else if (pattern === 3) {
                  pixelBuffer.set(a, pixelBufferPtr);
                  pixelBuffer.set(b, pixelBufferPtr += 320);
                  pixelBuffer.set(b, pixelBufferPtr += 320);
                  pixelBuffer.set(a, pixelBufferPtr += 320);
                  pixelBuffer.set(b, pixelBufferPtr += 320);
                  pixelBuffer.set(b, pixelBufferPtr += 320);
                  pixelBuffer.set(a, pixelBufferPtr += 320);
                  pixelBuffer.set(b, pixelBufferPtr += 320);
                }
              }
            }
          }
        }
      }
    }
    this.prevFrameIndex = frameIndex;
    return this.layers;
  }

  /** 
   * Get the pixels for a given frame layer
   * @category Image
  */
  public getLayerPixels(frameIndex: number, layerIndex: number) {
    if (this.prevFrameIndex !== frameIndex)
      this.decodeFrame(frameIndex);
    const palette = this.getFramePaletteIndices(frameIndex);
    const layers = this.layers[layerIndex];
    const image = new Uint8Array(KwzParser.width * KwzParser.height);
    const paletteOffset = layerIndex * 2 + 1;
    for (let pixelIndex = 0; pixelIndex < layers.length; pixelIndex++) {
      let pixel = layers[pixelIndex];
      if (pixel === 1)
        image[pixelIndex] = palette[paletteOffset];
      else if (pixel === 2)
        image[pixelIndex] = palette[paletteOffset + 1];
    }
    return image;
  }

  /** 
   * Get the pixels for a given frame
   * @category Image
  */
  public getFramePixels(frameIndex: number) {
    if (this.prevFrameIndex !== frameIndex)
      this.decodeFrame(frameIndex);
    const palette = this.getFramePaletteIndices(frameIndex);
    const layerOrder = this.getFrameLayerOrder(frameIndex);
    const layerA = this.layers[layerOrder[2]]; // top
    const layerB = this.layers[layerOrder[1]]; // middle
    const layerC = this.layers[layerOrder[0]]; // bottom
    const layerAOffset = layerOrder[2] * 2;
    const layerBOffset = layerOrder[1] * 2;
    const layerCOffset = layerOrder[0] * 2;
    if (!this.settings.dsiLibraryNote) {
      const image = new Uint8Array(KwzParser.width * KwzParser.height);
      image.fill(palette[0]); // fill with paper color first
      for (let pixel = 0; pixel < image.length; pixel++) {
        const a = layerA[pixel];
        const b = layerB[pixel];
        const c = layerC[pixel];
        if (a !== 0)
          image[pixel] = palette[layerAOffset + a];
        else if (b !== 0)
          image[pixel] = palette[layerBOffset + b];
        else if (c !== 0)
          image[pixel] = palette[layerCOffset + c];
      }
      return image;
    } 
    // for dsi gallery notes, bottom layer is ignored and edge is cropped
    else {
      const image = new Uint8Array(KwzParser.width * KwzParser.height);
      image.fill(palette[0]); // fill with paper color first
      const cropStartY = 32;
      const cropStartX = 24;
      const cropWidth = KwzParser.width - 64;
      const cropHeight = KwzParser.height - 48;
      const srcStride = KwzParser.width;
      for (let y = cropStartY; y < cropHeight; y++) {
        let srcPtr = y * srcStride;
        for (let x = cropStartX; x < cropWidth; x++) {
          const a = layerA[srcPtr];
          const b = layerB[srcPtr];
          if (a !== 0)
            image[srcPtr] = palette[layerAOffset + a];
          else if (b !== 0)
            image[srcPtr] = palette[layerBOffset + b];
          srcPtr += 1;
        }
      }
      return image;
    }  
  }
  
  /** 
   * Get the sound effect flags for every frame in the Flipnote
   * @category Audio
  */
  public decodeSoundFlags() {
    const result = [];
    for (let i = 0; i < this.frameCount; i++) {
      result.push(this.getFrameSoundFlags(i));
    }
    return result;
  }

  /** 
   * Get the raw compressed audio data for a given track
   * @returns Byte array
   * @category Audio
  */
  public getAudioTrackRaw(trackId: FlipnoteAudioTrack) {
    const trackMeta = this.soundMeta[trackId];
    assert(trackMeta.ptr + trackMeta.length < this.byteLength);
    return new Uint8Array(this.buffer, trackMeta.ptr, trackMeta.length);
  }

  /** 
   * Get the decoded audio data for a given track, using the track's native samplerate
   * @returns Signed 16-bit PCM audio
   * @category Audio
  */
  public decodeAudioTrack(trackId: FlipnoteAudioTrack) {
    const adpcm = this.getAudioTrackRaw(trackId);
    const output = new Int16Array(16364 * 60);
    let outputPtr = 0;
    // initial decoder state
    let predictor = 0;
    let stepIndex = 40;
    let sample = 0;
    let step = 0;
    let diff = 0;
    // Flipnote 3D's initial values are actually buggy, so stepIndex = 0 is technically more correct
    // DSi Library notes, however, seem to only work with 40 (at least the correctly converted ones)
    if (this.settings.cleanerAudio && !this.settings.dsiLibraryNote)
      stepIndex = 0;
    // loop through each byte in the raw adpcm data
    for (let adpcmPtr = 0; adpcmPtr < adpcm.length; adpcmPtr++) {
      let currByte = adpcm[adpcmPtr];
      let currBit = 0;
      while (currBit < 8) {
        // 2 bit sample
        if (stepIndex < 18 || currBit > 4) {
          sample = currByte & 0x3;
          step = ADPCM_STEP_TABLE[stepIndex];
          diff = step >> 3;
          if (sample & 1)
            diff += step;
          if (sample & 2)
            diff = -diff;
          predictor += diff;
          stepIndex += ADPCM_INDEX_TABLE_2BIT[sample];
          currByte >>= 2;
          currBit += 2;
        }
        // 4 bit sample
        else {
          sample = currByte & 0xf;
          step = ADPCM_STEP_TABLE[stepIndex];
          diff = step >> 3;
          if (sample & 1) 
            diff += step >> 2;
          if (sample & 2) 
            diff += step >> 1;
          if (sample & 4)
            diff += step;
          if (sample & 8)
            diff = -diff;
          predictor += diff;
          stepIndex += ADPCM_INDEX_TABLE_4BIT[sample];
          currByte >>= 4;
          currBit += 4;
        }
        stepIndex = clamp(stepIndex, 0, 79);
        // clamp as 12 bit then scale to 16
        predictor = clamp(predictor, -2048, 2047);
        output[outputPtr] = predictor * 16;
        outputPtr += 1;
      }
    }
    return output.slice(0, outputPtr);
  }

  /** 
   * Get the decoded audio data for a given track, using the specified samplerate
   * @returns Signed 16-bit PCM audio
   * @category Audio
  */
  public getAudioTrackPcm(trackId: FlipnoteAudioTrack, dstFreq = this.sampleRate) {
    const srcPcm = this.decodeAudioTrack(trackId);
    let srcFreq = this.rawSampleRate;
    if (trackId === FlipnoteAudioTrack.BGM) {
      const bgmAdjust = (1 / this.bgmrate) / (1 / this.framerate);
      srcFreq = this.rawSampleRate * bgmAdjust;
    }
    if (srcFreq !== dstFreq)
      return pcmDsAudioResample(srcPcm, srcFreq, dstFreq);

    return srcPcm;
  }

  private pcmAudioMix(src: Int16Array, dst: Int16Array, dstOffset: number = 0) {
    const srcSize = src.length;
    const dstSize = dst.length;
    for (let n = 0; n < srcSize; n++) {
      if (dstOffset + n > dstSize)
        break;
      // half src volume
      const samp = dst[dstOffset + n] + src[n];
      dst[dstOffset + n] = clamp(samp, -32768, 32767);
    }
  }

  /** 
   * Get the full mixed audio for the Flipnote, using the specified samplerate
   * @returns Signed 16-bit PCM audio
   * @category Audio
  */
  public getAudioMasterPcm(dstFreq = this.sampleRate) {
    const dstSize = Math.ceil(this.duration * dstFreq);
    const master = new Int16Array(dstSize);
    const hasBgm = this.hasAudioTrack(FlipnoteAudioTrack.BGM);
    const hasSe1 = this.hasAudioTrack(FlipnoteAudioTrack.SE1);
    const hasSe2 = this.hasAudioTrack(FlipnoteAudioTrack.SE2);
    const hasSe3 = this.hasAudioTrack(FlipnoteAudioTrack.SE3);
    const hasSe4 = this.hasAudioTrack(FlipnoteAudioTrack.SE4);
    // Mix background music
    if (hasBgm) {
      const bgmPcm = this.getAudioTrackPcm(FlipnoteAudioTrack.BGM, dstFreq);
      this.pcmAudioMix(bgmPcm, master, 0);
    }
    // Mix sound effects
    if (hasSe1 || hasSe2 || hasSe3 || hasSe4) {
      const samplesPerFrame = dstFreq / this.framerate;
      const se1Pcm = hasSe1 ? this.getAudioTrackPcm(FlipnoteAudioTrack.SE1, dstFreq) : null;
      const se2Pcm = hasSe2 ? this.getAudioTrackPcm(FlipnoteAudioTrack.SE2, dstFreq) : null;
      const se3Pcm = hasSe3 ? this.getAudioTrackPcm(FlipnoteAudioTrack.SE3, dstFreq) : null;
      const se4Pcm = hasSe4 ? this.getAudioTrackPcm(FlipnoteAudioTrack.SE4, dstFreq) : null;
      for (let i = 0; i < this.frameCount; i++) {
        const seFlags = this.getFrameSoundFlags(i);
        const seOffset = Math.ceil(i * samplesPerFrame);
        if (hasSe1 && seFlags[0])
          this.pcmAudioMix(se1Pcm, master, seOffset);
        if (hasSe2 && seFlags[1])
          this.pcmAudioMix(se2Pcm, master, seOffset);
        if (hasSe3 && seFlags[2])
          this.pcmAudioMix(se3Pcm, master, seOffset);
        if (hasSe4 && seFlags[3])
          this.pcmAudioMix(se4Pcm, master, seOffset);
      }
    }
    this.audioClipRatio = pcmGetClippingRatio(master);
    return master;
  }
}