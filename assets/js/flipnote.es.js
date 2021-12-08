/*!!
flipnote.js v5.6.7 (web build)
https://flipnote.js.org
A JavaScript library for parsing, converting, and in-browser playback of the proprietary animation formats used by Nintendo's Flipnote Studio and Flipnote Studio 3D apps.
2018 - 2021 James Daniel
Flipnote Studio is (c) Nintendo Co., Ltd. This project isn't affiliated with or endorsed by them in any way.
Keep on Flipnoting!
*/
/** @internal */
class ByteArray {
    constructor() {
        // sizes
        this.pageSize = 2048 * 2;
        this.allocSize = 0; // allocated size counting all pages
        this.realSize = 0; // number of bytes actually used
        // pages
        this.pages = [];
        this.numPages = 0;
        // pointers
        this.pageIdx = 0; // page to write to
        this.pagePtr = 0; // position in page to write to
        this.realPtr = 0; // position in file
        this.newPage();
    }
    set pointer(ptr) {
        this.setPointer(ptr);
    }
    get pointer() {
        return this.realPtr;
    }
    newPage() {
        this.pages[this.numPages] = new Uint8Array(this.pageSize);
        this.numPages = this.pages.length;
        this.allocSize = this.numPages * this.pageSize;
    }
    setPointer(ptr) {
        // allocate enough pages to include pointer
        while (ptr >= this.allocSize) {
            this.newPage();
        }
        // increase real file size if the end is reached
        if (ptr > this.realSize)
            this.realSize = ptr;
        // update ptrs
        // TODO: this is going to get hit a lot, maybe optimise?
        this.pageIdx = Math.floor(ptr / this.pageSize);
        this.pagePtr = ptr % this.pageSize;
        this.realPtr = ptr;
    }
    writeByte(value) {
        this.pages[this.pageIdx][this.pagePtr] = value;
        this.setPointer(this.realPtr + 1);
    }
    writeBytes(bytes, srcPtr, length) {
        for (let l = length || bytes.length, i = srcPtr || 0; i < l; i++)
            this.writeByte(bytes[i]);
    }
    writeChars(str) {
        for (let i = 0; i < str.length; i++) {
            this.writeByte(str.charCodeAt(i));
        }
    }
    writeU8(value) {
        this.writeByte(value & 0xFF);
    }
    writeU16(value) {
        this.writeByte((value >>> 0) & 0xFF);
        this.writeByte((value >>> 8) & 0xFF);
    }
    writeU32(value) {
        this.writeByte((value >>> 0) & 0xFF);
        this.writeByte((value >>> 8) & 0xFF);
        this.writeByte((value >>> 16) & 0xFF);
        this.writeByte((value >>> 24) & 0xFF);
    }
    getBytes() {
        const bytes = new Uint8Array(this.realSize);
        const numPages = this.numPages;
        for (let i = 0; i < numPages; i++) {
            const page = this.pages[i];
            if (i === numPages - 1) // last page
                bytes.set(page.slice(0, this.realSize % this.pageSize), i * this.pageSize);
            else
                bytes.set(page, i * this.pageSize);
        }
        return bytes;
    }
    getBuffer() {
        const bytes = this.getBytes();
        return bytes.buffer;
    }
}

/**
 * Wrapper around the DataView API to keep track of the offset into the data
 * also provides some utils for reading ascii strings etc
 * @internal
 */
class DataStream {
    constructor(arrayBuffer) {
        this.buffer = arrayBuffer;
        this.data = new DataView(arrayBuffer);
        this.pointer = 0;
    }
    get bytes() {
        return new Uint8Array(this.buffer);
    }
    get byteLength() {
        return this.data.byteLength;
    }
    seek(offset, whence) {
        switch (whence) {
            case 2 /* End */:
                this.pointer = this.data.byteLength + offset;
                break;
            case 1 /* Current */:
                this.pointer += offset;
                break;
            case 0 /* Begin */:
            default:
                this.pointer = offset;
                break;
        }
    }
    readUint8() {
        const val = this.data.getUint8(this.pointer);
        this.pointer += 1;
        return val;
    }
    writeUint8(value) {
        this.data.setUint8(this.pointer, value);
        this.pointer += 1;
    }
    readInt8() {
        const val = this.data.getInt8(this.pointer);
        this.pointer += 1;
        return val;
    }
    writeInt8(value) {
        this.data.setInt8(this.pointer, value);
        this.pointer += 1;
    }
    readUint16(littleEndian = true) {
        const val = this.data.getUint16(this.pointer, littleEndian);
        this.pointer += 2;
        return val;
    }
    writeUint16(value, littleEndian = true) {
        this.data.setUint16(this.pointer, value, littleEndian);
        this.pointer += 2;
    }
    readInt16(littleEndian = true) {
        const val = this.data.getInt16(this.pointer, littleEndian);
        this.pointer += 2;
        return val;
    }
    writeInt16(value, littleEndian = true) {
        this.data.setInt16(this.pointer, value, littleEndian);
        this.pointer += 2;
    }
    readUint32(littleEndian = true) {
        const val = this.data.getUint32(this.pointer, littleEndian);
        this.pointer += 4;
        return val;
    }
    writeUint32(value, littleEndian = true) {
        this.data.setUint32(this.pointer, value, littleEndian);
        this.pointer += 4;
    }
    readInt32(littleEndian = true) {
        const val = this.data.getInt32(this.pointer, littleEndian);
        this.pointer += 4;
        return val;
    }
    writeInt32(value, littleEndian = true) {
        this.data.setInt32(this.pointer, value, littleEndian);
        this.pointer += 4;
    }
    readBytes(count) {
        const bytes = new Uint8Array(this.data.buffer, this.pointer, count);
        this.pointer += bytes.byteLength;
        return bytes;
    }
    writeBytes(bytes) {
        bytes.forEach((byte) => this.writeUint8(byte));
    }
    readHex(count, reverse = false) {
        const bytes = this.readBytes(count);
        let hex = [];
        for (let i = 0; i < bytes.length; i++) {
            hex.push(bytes[i].toString(16).padStart(2, '0'));
        }
        if (reverse)
            hex.reverse();
        return hex.join('').toUpperCase();
    }
    readChars(count) {
        const chars = this.readBytes(count);
        let str = '';
        for (let i = 0; i < chars.length; i++) {
            const char = chars[i];
            if (char === 0)
                break;
            str += String.fromCharCode(char);
        }
        return str;
    }
    writeChars(string) {
        for (let i = 0; i < string.length; i++) {
            const char = string.charCodeAt(i);
            this.writeUint8(char);
        }
    }
    readWideChars(count) {
        const chars = new Uint16Array(this.data.buffer, this.pointer, count);
        let str = '';
        for (let i = 0; i < chars.length; i++) {
            const char = chars[i];
            if (char == 0)
                break;
            str += String.fromCharCode(char);
        }
        this.pointer += chars.byteLength;
        return str;
    }
}

/** @internal */
const ADPCM_INDEX_TABLE_2BIT = new Int8Array([
    -1, 2, -1, 2
]);
/** @internal */
const ADPCM_INDEX_TABLE_4BIT = new Int8Array([
    -1, -1, -1, -1, 2, 4, 6, 8,
    -1, -1, -1, -1, 2, 4, 6, 8
]);
/** @internal */
const ADPCM_STEP_TABLE = new Int16Array([
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17,
    19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
    50, 55, 60, 66, 73, 80, 88, 97, 107, 118,
    130, 143, 157, 173, 190, 209, 230, 253, 279, 307,
    337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
    876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066,
    2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358,
    5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899,
    15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767, 0
]);
/**
 * Clamp a number n between l and h
 * @internal
 */
function clamp(n, l, h) {
    if (n < l)
        return l;
    if (n > h)
        return h;
    return n;
}
/**
 * Interpolate between a and b - returns a if fac = 0, b if fac = 1, and somewhere between if 0 < fac < 1
 * @internal
 */
const lerp = (a, b, fac) => a + fac * (b - a);
/** @internal */
function pcmGetSample(src, srcSize, srcPtr) {
    if (srcPtr < 0 || srcPtr >= srcSize)
        return 0;
    return src[srcPtr];
}
/**
 * Zero-order hold (nearest neighbour) audio interpolation
 * Credit to SimonTime for the original C version
 * @internal
 */
function pcmResampleNearestNeighbour(src, srcFreq, dstFreq) {
    const srcLength = src.length;
    const srcDuration = srcLength / srcFreq;
    const dstLength = srcDuration * dstFreq;
    const dst = new Int16Array(dstLength);
    const adjFreq = srcFreq / dstFreq;
    for (let dstPtr = 0; dstPtr < dstLength; dstPtr++) {
        dst[dstPtr] = pcmGetSample(src, srcLength, Math.floor(dstPtr * adjFreq));
    }
    return dst;
}
/**
 * Simple linear audio interpolation
 * @internal
 */
function pcmResampleLinear(src, srcFreq, dstFreq) {
    const srcLength = src.length;
    const srcDuration = srcLength / srcFreq;
    const dstLength = srcDuration * dstFreq;
    const dst = new Int16Array(dstLength);
    const adjFreq = srcFreq / dstFreq;
    for (let dstPtr = 0, adj = 0, srcPtr = 0, weight = 0; dstPtr < dstLength; dstPtr++) {
        adj = dstPtr * adjFreq;
        srcPtr = Math.floor(adj);
        weight = adj % 1;
        dst[dstPtr] = lerp(pcmGetSample(src, srcLength, srcPtr), pcmGetSample(src, srcLength, srcPtr + 1), weight);
    }
    return dst;
}
/**
 * Get a ratio of how many audio samples hit the pcm_s16_le clipping bounds
 * This can be used to detect corrupted audio
 * @internal
 */
function pcmGetClippingRatio(src) {
    const numSamples = src.length;
    let numClippedSamples = 0;
    for (let i = 0; i < numSamples; i++) {
        const sample = src[i];
        if (sample <= -32768 || sample >= 32767)
            numClippedSamples += 1;
    }
    return numClippedSamples / numSamples;
}
/**
 * Get the root mean square of a PCM track
 * @internal
 */
function pcmGetRms(src) {
    const numSamples = src.length;
    let rms = 0;
    for (let i = 0; i < numSamples; i++) {
        rms += Math.pow(src[i], 2);
    }
    return Math.sqrt(rms / numSamples);
}

/**
 * Assert condition is true
 * @internal
 */
function assert(condition, errMsg = 'Assert failed') {
    if (!condition) {
        console.trace(errMsg);
        throw new Error(errMsg);
    }
}
/**
 * Assert that a numberical value is between upper and lower bounds
 * @internal
 */
function assertRange(value, min, max, name = '') {
    assert(value >= min && value <= max, `${name || 'value'} ${value} should be between ${min} and ${max}`);
}

/**
 * Webpack tries to replace inline calles to require() with polyfills,
 * but we don't want that, since we only use require to add extra features in NodeJs environments
 *
 * Modified from:
 * https://github.com/getsentry/sentry-javascript/blob/bd35d7364191ebed994fb132ff31031117c1823f/packages/utils/src/misc.ts#L9-L11
 * https://github.com/getsentry/sentry-javascript/blob/89bca28994a0eaab9bc784841872b12a1f4a875c/packages/hub/src/hub.ts#L340
 * @internal
 */
function dynamicRequire(nodeModule, p) {
    try {
        return nodeModule.require(p);
    }
    catch {
        throw new Error(`Could not require(${p})`);
    }
}
/**
 * Safely get global scope object
 * @internal
 */
function getGlobalObject() {
    return isNode
        ? global
        : typeof window !== 'undefined'
            ? window
            : typeof self !== 'undefined'
                ? self
                : {};
}
/**
 * Utils to find out information about the current code execution environment
 */
/**
 * Is the code running in a browser environment?
 * @internal
 */
const isBrowser = typeof window !== 'undefined'
    && typeof window.document !== 'undefined';
/**
 * Assert that the current environment should support browser APIs
 * @internal
 */
function assertBrowserEnv() {
    return assert(isBrowser, 'This feature is only available in browser environments');
}
/**
 * Is the code running in a Node environment?
 * @internal
 */
const isNode = typeof process !== 'undefined'
    && process.versions != null
    && process.versions.node != null;
/**
 * Assert that the current environment should support NodeJS APIs
 * @internal
 */
function assertNodeEnv() {
    return assert(isNode, 'This feature is only available in NodeJS environments');
}
// TODO: Deno support?
/**
 * Is the code running in a Web Worker enviornment?
 * @internal
 */
const isWebWorker = typeof self === 'object'
    && self.constructor
    && self.constructor.name === 'DedicatedWorkerGlobalScope';

/**
 * same SubtleCrypto API is available in browser and node, but in node it isn't global
 * @internal
 */
const SUBTLE_CRYPTO = (() => {
    if (isBrowser || isWebWorker) {
        const global = getGlobalObject();
        return (global.crypto || global.msCrypto).subtle;
    }
    else if (isNode)
        return dynamicRequire(module, 'crypto').webcrypto.subtle;
})();
/**
 * crypto algo used
 * @internal
 */
const ALGORITHM = 'RSASSA-PKCS1-v1_5';
/**
 * @internal
 */
async function rsaLoadPublicKey(pemKey, hashType) {
    // remove PEM header and footer
    const lines = pemKey
        .split('\n')
        .filter(line => !line.startsWith('-----') && !line.endsWith('-----'))
        .join('');
    // base64 decode
    const keyPlaintext = atob(lines);
    // convert to byte array
    const keyBytes = new Uint8Array(keyPlaintext.length)
        .map((_, i) => keyPlaintext.charCodeAt(i));
    // create cypto api key
    return await SUBTLE_CRYPTO.importKey('spki', keyBytes.buffer, {
        name: ALGORITHM,
        hash: hashType,
    }, false, ['verify']);
}
/**
 * @internal
 */
async function rsaVerify(key, signature, data) {
    return await SUBTLE_CRYPTO.verify(ALGORITHM, key, signature, data);
}

/**
 * Number of seconds between the UNIX timestamp epoch (jan 1 1970) and the Nintendo timestamp epoch (jan 1 2000)
 * @internal
 */
const UNIX_EPOCH_2000 = 946684800;
/**
 * Convert a Nintendo DS or 3DS timestamp int to a JS Date object
 * @internal
 */
function dateFromNintendoTimestamp(timestamp) {
    return new Date((timestamp + UNIX_EPOCH_2000) * 1000);
}
/**
 * Get the duration (in seconds) of a number of framres running at a specified framerate
 * @internal
 */
function timeGetNoteDuration(frameCount, framerate) {
    // multiply and devide by 100 to get around floating precision issues
    return ((frameCount * 100) * (1 / framerate)) / 100;
}

/**
 * Flipnote region
 */
var FlipnoteRegion;
(function (FlipnoteRegion) {
    /** Europe and Oceania */
    FlipnoteRegion["EUR"] = "EUR";
    /** Americas */
    FlipnoteRegion["USA"] = "USA";
    /** Japan */
    FlipnoteRegion["JPN"] = "JPN";
    /** Unidentified (possibly never used) */
    FlipnoteRegion["UNKNOWN"] = "UNKNOWN";
})(FlipnoteRegion || (FlipnoteRegion = {}));
/**
 * Match an FSID from Flipnote Studio
 * e.g. 1440D700CEF78DA8
 * @internal
 */
const REGEX_PPM_FSID = /^[0159]{1}[0-9A-F]{6}0[0-9A-F]{8}$/;
/**
 * Match an FSID from Flipnote Studio 3D
 * e.g. 003f-0b7e-82a6-fe0bda
 * @internal
 */
const REGEX_KWZ_FSID = /^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{6}$/;
/**
 * Match an FSID from a DSi Library note (PPM to KWZ conversion)
 * e.g. 10b8-b909-5180-9b2013
 * @internal
 */
const REGEX_KWZ_DSI_LIBRARY_FSID = /^(00|10|12|14)[0-9a-f]{2}-[0-9a-f]{4}-[0-9a-f]{3}0-[0-9a-f]{4}[0159]{1}[0-9a-f]{1}$/;
/**
 * Indicates whether the input is a valid Flipnote Studio user ID
 */
function isPpmFsid(fsid) {
    // The only known exception to the FSID format is the one Nintendo used for their event notes (mario, zelda 25th, etc)
    // This is likely a goof on their part
    return fsid === '14E494E35A443235' || REGEX_PPM_FSID.test(fsid);
}
/**
 * Indicates whether the input is a valid Flipnote Studio 3D user ID
 */
function isKwzFsid(fsid) {
    return REGEX_KWZ_FSID.test(fsid);
}
/**
 * Indicates whether the input is a valid DSi Library user ID
 */
function isKwzDsiLibraryFsid(fsid) {
    // DSi Library eqiuvalent of the 14E494E35A443235 ID exception
    return fsid.endsWith('3532445AE394E414') || REGEX_KWZ_DSI_LIBRARY_FSID.test(fsid);
}
/**
 * Indicates whether the input is a valid Flipnote Studio or Flipnote Studio 3D user ID
 */
function isFsid(fsid) {
    return isPpmFsid(fsid) || isKwzFsid(fsid);
}
/**
 * Get the region for any valid Flipnote Studio user ID
 */
function getPpmFsidRegion(fsid) {
    switch (fsid.charAt(0)) {
        case '0':
        case '1':
            return FlipnoteRegion.JPN;
        case '5':
            return FlipnoteRegion.USA;
        case '9':
            return FlipnoteRegion.EUR;
        default:
            return FlipnoteRegion.UNKNOWN;
    }
}
/**
 * Get the region for any valid Flipnote Studio 3D user ID
 */
function getKwzFsidRegion(fsid) {
    if (isKwzDsiLibraryFsid(fsid)) {
        switch (fsid.charAt(19)) {
            case '0':
            case '1':
                return FlipnoteRegion.JPN;
            case '5':
                return FlipnoteRegion.USA;
            case '9':
                return FlipnoteRegion.EUR;
            default:
                return FlipnoteRegion.UNKNOWN;
        }
    }
    switch (fsid.slice(0, 2)) {
        case '00':
            return FlipnoteRegion.JPN;
        case '02':
            return FlipnoteRegion.USA;
        case '04':
            return FlipnoteRegion.EUR;
        default:
            return FlipnoteRegion.UNKNOWN;
    }
}
/**
 * Get the region for any valid Flipnote Studio or Flipnote Studio 3D user ID
 */
function getFsidRegion(fsid) {
    if (isPpmFsid(fsid))
        return getPpmFsidRegion(fsid);
    else if (isKwzFsid(fsid))
        return getKwzFsidRegion(fsid);
    return FlipnoteRegion.UNKNOWN;
}

var fsid = /*#__PURE__*/Object.freeze({
  __proto__: null,
  get FlipnoteRegion () { return FlipnoteRegion; },
  isPpmFsid: isPpmFsid,
  isKwzFsid: isKwzFsid,
  isKwzDsiLibraryFsid: isKwzDsiLibraryFsid,
  isFsid: isFsid,
  getPpmFsidRegion: getPpmFsidRegion,
  getKwzFsidRegion: getKwzFsidRegion,
  getFsidRegion: getFsidRegion
});

/** @internal */
((function () {
    if (!isBrowser) {
        return function () { };
    }
    var a = document.createElement("a");
    // document.body.appendChild(a);
    // a.style.display = "none";
    return function (blob, filename) {
        const url = window.URL.createObjectURL(blob);
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    };
}))();

/** Identifies which animation format a Flipnote uses */
var FlipnoteFormat;
(function (FlipnoteFormat) {
    /** Animation format used by Flipnote Studio (Nintendo DSiWare) */
    FlipnoteFormat["PPM"] = "PPM";
    /** Animation format used by Flipnote Studio 3D (Nintendo 3DS) */
    FlipnoteFormat["KWZ"] = "KWZ";
})(FlipnoteFormat || (FlipnoteFormat = {}));
/** Identifies a Flipnote audio track type */
var FlipnoteAudioTrack;
(function (FlipnoteAudioTrack) {
    /** Background music track */
    FlipnoteAudioTrack[FlipnoteAudioTrack["BGM"] = 0] = "BGM";
    /** Sound effect 1 track */
    FlipnoteAudioTrack[FlipnoteAudioTrack["SE1"] = 1] = "SE1";
    /** Sound effect 2 track */
    FlipnoteAudioTrack[FlipnoteAudioTrack["SE2"] = 2] = "SE2";
    /** Sound effect 3 track */
    FlipnoteAudioTrack[FlipnoteAudioTrack["SE3"] = 3] = "SE3";
    /** Sound effect 4 track (only used by KWZ files) */
    FlipnoteAudioTrack[FlipnoteAudioTrack["SE4"] = 4] = "SE4";
})(FlipnoteAudioTrack || (FlipnoteAudioTrack = {}));
/** {@link FlipnoteAudioTrack}, but just sound effect tracks */
var FlipnoteSoundEffectTrack;
(function (FlipnoteSoundEffectTrack) {
    FlipnoteSoundEffectTrack[FlipnoteSoundEffectTrack["SE1"] = 1] = "SE1";
    FlipnoteSoundEffectTrack[FlipnoteSoundEffectTrack["SE2"] = 2] = "SE2";
    FlipnoteSoundEffectTrack[FlipnoteSoundEffectTrack["SE3"] = 3] = "SE3";
    FlipnoteSoundEffectTrack[FlipnoteSoundEffectTrack["SE4"] = 4] = "SE4";
})(FlipnoteSoundEffectTrack || (FlipnoteSoundEffectTrack = {}));
/**
 * Base Flipnote parser class
 *
 * This doesn't implement any parsing functionality itself,
 * it just provides a consistent API for every format parser to implement.
 * @category File Parser
*/
class FlipnoteParserBase extends DataStream {
    constructor() {
        /** Static file format info */
        super(...arguments);
        /** Instance file format info */
        /** Custom object tag */
        this[Symbol.toStringTag] = 'Flipnote';
        /** Default formats used for {@link getTitle()} */
        this.titleFormats = {
            COMMENT: 'Comment by $USERNAME',
            FLIPNOTE: 'Flipnote by $USERNAME',
            ICON: 'Folder icon'
        };
        /** File audio track info, see {@link FlipnoteAudioTrackInfo} */
        this.soundMeta = new Map();
        /** Animation frame global layer visibility */
        this.layerVisibility = { 1: true, 2: true, 3: true };
        /** (KWZ only) Indicates whether or not this file is a Flipnote Studio 3D folder icon */
        this.isFolderIcon = false;
        /** (KWZ only) Indicates whether or not this file is a handwritten comment from Flipnote Gallery World */
        this.isComment = false;
        /** (KWZ only) Indicates whether or not this Flipnote is a PPM to KWZ conversion from Flipnote Studio 3D's DSi Library service */
        this.isDsiLibraryNote = false;
    }
    /**
     * Get file default title - e.g. "Flipnote by Y", "Comment by X", etc.
     * A format object can be passed for localisation, where `$USERNAME` gets replaced by author name:
     * ```js
     * {
     *  COMMENT: 'Comment by $USERNAME',
     *  FLIPNOTE: 'Flipnote by $USERNAME',
     *  ICON: 'Folder icon'
     * }
     * ```
     * @category Utility
     */
    getTitle(formats = this.titleFormats) {
        if (this.isFolderIcon)
            return formats.ICON;
        const title = this.isComment ? formats.COMMENT : formats.FLIPNOTE;
        return title.replace('$USERNAME', this.meta.current.username);
    }
    /**
     * Returns the Flipnote title when casting a parser instance to a string
     *
     * ```js
     * const str = 'Title: ' + note;
     * // str === 'Title: Flipnote by username'
     * ```
     * @category Utility
     */
    toString() {
        return this.getTitle();
    }
    /**
     * Allows for frame index iteration when using the parser instance as a for..of iterator
     *
     * ```js
     * for (const frameIndex of note) {
     *   // do something with frameIndex...
     * }
     * ```
     * @category Utility
     */
    *[Symbol.iterator]() {
        for (let i = 0; i < this.frameCount; i++)
            yield i;
    }
    /**
     * Get the pixels for a given frame layer, as palette indices
     * NOTE: layerIndex are not guaranteed to be sorted by 3D depth in KWZs, use {@link getFrameLayerOrder} to get the correct sort order first
     * NOTE: if the visibility flag for this layer is turned off, the result will be empty
     * @category Image
    */
    getLayerPixels(frameIndex, layerIndex, imageBuffer = new Uint8Array(this.imageWidth * this.imageHeight)) {
        assertRange(frameIndex, 0, this.frameCount - 1, 'Frame index');
        assertRange(layerIndex, 0, this.numLayers - 1, 'Layer index');
        // palette
        const palette = this.getFramePaletteIndices(frameIndex);
        const palettePtr = layerIndex * this.numLayerColors;
        // raw pixels
        const layers = this.decodeFrame(frameIndex);
        const layerBuffer = layers[layerIndex];
        // image dimensions and crop
        const srcStride = this.srcWidth;
        const width = this.imageWidth;
        const height = this.imageHeight;
        const xOffs = this.imageOffsetX;
        const yOffs = this.imageOffsetY;
        // clear image buffer before writing
        imageBuffer.fill(0);
        // handle layer visibility by returning a blank image if the layer is invisible
        if (!this.layerVisibility[layerIndex + 1])
            return imageBuffer;
        // convert to palette indices and crop
        for (let srcY = yOffs, dstY = 0; dstY < height; srcY++, dstY++) {
            for (let srcX = xOffs, dstX = 0; dstX < width; srcX++, dstX++) {
                const srcPtr = srcY * srcStride + srcX;
                const dstPtr = dstY * width + dstX;
                let pixel = layerBuffer[srcPtr];
                if (pixel !== 0)
                    imageBuffer[dstPtr] = palette[palettePtr + pixel];
            }
        }
        return imageBuffer;
    }
    /**
     * Get the pixels for a given frame layer, as RGBA pixels
     * NOTE: layerIndex are not guaranteed to be sorted by 3D depth in KWZs, use {@link getFrameLayerOrder} to get the correct sort order first
     * NOTE: if the visibility flag for this layer is turned off, the result will be empty
     * @category Image
    */
    getLayerPixelsRgba(frameIndex, layerIndex, imageBuffer = new Uint32Array(this.imageWidth * this.imageHeight), paletteBuffer = new Uint32Array(16)) {
        assertRange(frameIndex, 0, this.frameCount - 1, 'Frame index');
        assertRange(layerIndex, 0, this.numLayers - 1, 'Layer index');
        // palette
        this.getFramePaletteUint32(frameIndex, paletteBuffer);
        const palettePtr = layerIndex * this.numLayerColors;
        // raw pixels
        const layers = this.decodeFrame(frameIndex);
        const layerBuffer = layers[layerIndex];
        // image dimensions and crop
        const srcStride = this.srcWidth;
        const width = this.imageWidth;
        const height = this.imageHeight;
        const xOffs = this.imageOffsetX;
        const yOffs = this.imageOffsetY;
        // clear image buffer before writing
        imageBuffer.fill(paletteBuffer[0]);
        // handle layer visibility by returning a blank image if the layer is invisible
        if (!this.layerVisibility[layerIndex + 1])
            return imageBuffer;
        // convert to palette indices and crop
        for (let srcY = yOffs, dstY = 0; dstY < height; srcY++, dstY++) {
            for (let srcX = xOffs, dstX = 0; dstX < width; srcX++, dstX++) {
                const srcPtr = srcY * srcStride + srcX;
                const dstPtr = dstY * width + dstX;
                let pixel = layerBuffer[srcPtr];
                if (pixel !== 0)
                    imageBuffer[dstPtr] = paletteBuffer[palettePtr + pixel];
            }
        }
        return imageBuffer;
    }
    /**
     * Get the image for a given frame, as palette indices
     * @category Image
    */
    getFramePixels(frameIndex, imageBuffer = new Uint8Array(this.imageWidth * this.imageHeight)) {
        // image dimensions and crop
        const srcStride = this.srcWidth;
        const width = this.imageWidth;
        const height = this.imageHeight;
        const xOffs = this.imageOffsetX;
        const yOffs = this.imageOffsetY;
        // palette
        const palette = this.getFramePaletteIndices(frameIndex);
        // clear framebuffer with paper color
        imageBuffer.fill(palette[0]);
        // get layer info + decode into buffers
        const layerOrder = this.getFrameLayerOrder(frameIndex);
        const layers = this.decodeFrame(frameIndex);
        // merge layers into framebuffer
        for (let i = 0; i < this.numLayers; i++) {
            const layerIndex = layerOrder[i];
            const layerBuffer = layers[layerIndex];
            const palettePtr = layerIndex * this.numLayerColors;
            // skip if layer is not visible
            if (!this.layerVisibility[layerIndex + 1])
                continue;
            // merge layer into rgb buffer
            for (let srcY = yOffs, dstY = 0; dstY < height; srcY++, dstY++) {
                for (let srcX = xOffs, dstX = 0; dstX < width; srcX++, dstX++) {
                    const srcPtr = srcY * srcStride + srcX;
                    const dstPtr = dstY * width + dstX;
                    let pixel = layerBuffer[srcPtr];
                    if (pixel !== 0)
                        imageBuffer[dstPtr] = palette[palettePtr + pixel];
                }
            }
        }
        return imageBuffer;
    }
    /**
     * Get the image for a given frame as an uint32 array of RGBA pixels
     * @category Image
     */
    getFramePixelsRgba(frameIndex, imageBuffer = new Uint32Array(this.imageWidth * this.imageHeight), paletteBuffer = new Uint32Array(16)) {
        assertRange(frameIndex, 0, this.frameCount - 1, 'Frame index');
        // image dimensions and crop
        const srcStride = this.srcWidth;
        const width = this.imageWidth;
        const height = this.imageHeight;
        const xOffs = this.imageOffsetX;
        const yOffs = this.imageOffsetY;
        // palette
        this.getFramePaletteUint32(frameIndex, paletteBuffer);
        // clear framebuffer with paper color
        imageBuffer.fill(paletteBuffer[0]);
        // get layer info + decode into buffers
        const layerOrder = this.getFrameLayerOrder(frameIndex);
        const layers = this.decodeFrame(frameIndex);
        // merge layers into framebuffer
        for (let i = 0; i < this.numLayers; i++) {
            const layerIndex = layerOrder[i];
            const layerBuffer = layers[layerIndex];
            const palettePtr = layerIndex * this.numLayerColors;
            // skip if layer is not visible
            if (!this.layerVisibility[layerIndex + 1])
                continue;
            // merge layer into rgb buffer
            for (let srcY = yOffs, dstY = 0; dstY < height; srcY++, dstY++) {
                for (let srcX = xOffs, dstX = 0; dstX < width; srcX++, dstX++) {
                    const srcPtr = srcY * srcStride + srcX;
                    const dstPtr = dstY * width + dstX;
                    let pixel = layerBuffer[srcPtr];
                    if (pixel !== 0)
                        imageBuffer[dstPtr] = paletteBuffer[palettePtr + pixel];
                }
            }
        }
        return imageBuffer;
    }
    /**
     * Get the color palette for a given frame, as an uint32 array
     * @category Image
    */
    getFramePaletteUint32(frameIndex, paletteBuffer = new Uint32Array(16)) {
        assertRange(frameIndex, 0, this.frameCount - 1, 'Frame index');
        const colors = this.getFramePalette(frameIndex);
        paletteBuffer.fill(0);
        colors.forEach(([r, g, b, a], i) => paletteBuffer[i] = (a << 24) | (b << 16) | (g << 8) | r);
        return paletteBuffer;
    }
    /**
     * Get the usage flags for a given track accross every frame
     * @returns an array of booleans for every frame, indicating whether the track is used on that frame
     * @category Audio
     */
    getSoundEffectFlagsForTrack(trackId) {
        return this.getSoundEffectFlags().map(frammeFlags => frammeFlags[trackId]);
    }
    ;
    /**
     * Is a given track used on a given frame
     * @category Audio
     */
    isSoundEffectUsedOnFrame(trackId, frameIndex) {
        assertRange(frameIndex, 0, this.frameCount - 1, 'Frame index');
        if (!this.soundEffectTracks.includes(trackId))
            return false;
        return this.getFrameSoundEffectFlags(frameIndex)[trackId];
    }
    /**
     * Does an audio track exist in the Flipnote?
     * @returns boolean
     * @category Audio
    */
    hasAudioTrack(trackId) {
        return this.soundMeta.has(trackId) && this.soundMeta.get(trackId).length > 0;
    }
}

/**
 * PPM framerates in frames per second, indexed by the in-app frame speed.
 * Frame speed 0 is never noramally used
 */
const PPM_FRAMERATES = [0.5, 0.5, 1, 2, 4, 6, 12, 20, 30];
/**
 * PPM color defines (red, green, blue, alpha)
 */
const PPM_PALETTE = {
    WHITE: [0xff, 0xff, 0xff, 0xff],
    BLACK: [0x0e, 0x0e, 0x0e, 0xff],
    RED: [0xff, 0x2a, 0x2a, 0xff],
    BLUE: [0x0a, 0x39, 0xff, 0xff]
};
/**
 * RSA public key used to verify that the PPM file signature is genuine.
 *
 * This **cannot** be used to resign Flipnotes, it can only verify that they are valid
 */
const PPM_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDCPLwTL6oSflv+gjywi/sM0TUB
90xqOvuCpjduETjPoN2FwMebxNjdKIqHUyDu4AvrQ6BDJc6gKUbZ1E27BGZoCPH4
9zQRb+zAM6M9EjHwQ6BABr0u2TcF7xGg2uQ9MBWz9AfbVQ91NjfrNWo0f7UPmffv
1VvixmTk1BCtavZxBwIDAQAB
-----END PUBLIC KEY-----`;
/**
 * Parser class for (DSiWare) Flipnote Studio's PPM animation format.
 *
 * Format docs: https://github.com/Flipnote-Collective/flipnote-studio-docs/wiki/PPM-format
 * @category File Parser
 */
class PpmParser extends FlipnoteParserBase {
    /**
     * Create a new PPM file parser instance
     * @param arrayBuffer an ArrayBuffer containing file data
     * @param settings parser settings (none currently implemented)
     */
    constructor(arrayBuffer, settings = {}) {
        super(arrayBuffer);
        /** File format type, reflects {@link PpmParser.format} */
        this.format = FlipnoteFormat.PPM;
        /** Custom object tag */
        this[Symbol.toStringTag] = 'Flipnote Studio PPM animation file';
        /** Animation frame width, reflects {@link PpmParser.width} */
        this.imageWidth = PpmParser.width;
        /** Animation frame height, reflects {@link PpmParser.height} */
        this.imageHeight = PpmParser.height;
        /** X offset for the top-left corner of the animation frame */
        this.imageOffsetX = 0;
        /** Y offset for the top-left corner of the animation frame */
        this.imageOffsetY = 0;
        /** Number of animation frame layers, reflects {@link PpmParser.numLayers} */
        this.numLayers = PpmParser.numLayers;
        /** Number of colors per layer (aside from transparent), reflects {@link PpmParser.numLayerColors} */
        this.numLayerColors = PpmParser.numLayerColors;
        /** key used for Flipnote verification, in PEM format */
        this.publicKey = PpmParser.publicKey;
        /** @internal */
        this.srcWidth = PpmParser.width;
        /** Which audio tracks are available in this format, reflects {@link PpmParser.audioTracks} */
        this.audioTracks = PpmParser.audioTracks;
        /** Which sound effect tracks are available in this format, reflects {@link PpmParser.soundEffectTracks} */
        this.soundEffectTracks = PpmParser.soundEffectTracks;
        /** Audio track base sample rate, reflects {@link PpmParser.rawSampleRate} */
        this.rawSampleRate = PpmParser.rawSampleRate;
        /** Audio output sample rate, reflects {@link PpmParser.sampleRate} */
        this.sampleRate = PpmParser.sampleRate;
        /** Global animation frame color palette, reflects {@link PpmParser.globalPalette} */
        this.globalPalette = PpmParser.globalPalette;
        this.prevDecodedFrame = null;
        this.decodeHeader();
        this.decodeAnimationHeader();
        this.decodeSoundHeader();
        // this is always true afaik, it's likely just a remnant from development
        // doesn't hurt to be accurate though...
        if (((this.version >> 4) & 0xf) !== 0) {
            this.decodeMeta();
        }
        // create image buffers
        this.layerBuffers = [
            new Uint8Array(PpmParser.width * PpmParser.height),
            new Uint8Array(PpmParser.width * PpmParser.height)
        ];
        this.prevLayerBuffers = [
            new Uint8Array(PpmParser.width * PpmParser.height),
            new Uint8Array(PpmParser.width * PpmParser.height)
        ];
        this.lineEncodingBuffers = [
            new Uint8Array(PpmParser.height),
            new Uint8Array(PpmParser.height)
        ];
        this.prevDecodedFrame = null;
    }
    decodeHeader() {
        assert(16 < this.byteLength);
        this.seek(4);
        // decode header
        // https://github.com/Flipnote-Collective/flipnote-studio-docs/wiki/PPM-format#header
        this.frameDataLength = this.readUint32();
        this.soundDataLength = this.readUint32();
        this.frameCount = this.readUint16() + 1;
        this.version = this.readUint16();
        // sound data offset = frame data offset + frame data length + sound effect flags
        let soundDataOffset = 0x06A0 + this.frameDataLength + this.frameCount;
        if (soundDataOffset % 4 !== 0)
            soundDataOffset += 4 - (soundDataOffset % 4);
        assert(soundDataOffset < this.byteLength);
        this.soundDataOffset = soundDataOffset;
    }
    readFilename() {
        const mac = this.readHex(3);
        const random = this.readChars(13);
        const edits = this.readUint16().toString().padStart(3, '0');
        return `${mac}_${random}_${edits}`;
    }
    decodeMeta() {
        // https://github.com/Flipnote-Collective/flipnote-studio-docs/wiki/PPM-format#metadata
        assert(0x06A8 < this.byteLength);
        this.seek(0x10);
        const lock = this.readUint16();
        const thumbIndex = this.readInt16();
        const rootAuthorName = this.readWideChars(11);
        const parentAuthorName = this.readWideChars(11);
        const currentAuthorName = this.readWideChars(11);
        const parentAuthorId = this.readHex(8, true);
        const currentAuthorId = this.readHex(8, true);
        const parentFilename = this.readFilename();
        const currentFilename = this.readFilename();
        const rootAuthorId = this.readHex(8, true);
        this.seek(0x9A);
        const timestamp = dateFromNintendoTimestamp(this.readInt32());
        this.seek(0x06A6);
        const flags = this.readUint16();
        this.thumbFrameIndex = thumbIndex;
        this.layerVisibility = {
            1: (flags & 0x10) === 0,
            2: (flags & 0x20) === 0,
            3: false
        };
        this.isSpinoff = (currentAuthorId !== parentAuthorId) || (currentAuthorId !== rootAuthorId);
        this.meta = {
            lock: lock === 1,
            loop: (flags >> 1 & 0x1) === 1,
            isSpinoff: this.isSpinoff,
            frameCount: this.frameCount,
            frameSpeed: this.frameSpeed,
            bgmSpeed: this.bgmSpeed,
            duration: this.duration,
            thumbIndex: thumbIndex,
            timestamp: timestamp,
            root: {
                username: rootAuthorName,
                fsid: rootAuthorId,
                region: getPpmFsidRegion(rootAuthorId),
                filename: null
            },
            parent: {
                username: parentAuthorName,
                fsid: parentAuthorId,
                region: getPpmFsidRegion(parentAuthorId),
                filename: parentFilename
            },
            current: {
                username: currentAuthorName,
                fsid: currentAuthorId,
                region: getPpmFsidRegion(currentAuthorId),
                filename: currentFilename
            },
        };
    }
    decodeAnimationHeader() {
        // jump to the start of the animation data section
        // https://github.com/Flipnote-Collective/flipnote-studio-docs/wiki/PPM-format#animation-header
        this.seek(0x06A0);
        const offsetTableLength = this.readUint16();
        const numOffsets = offsetTableLength / 4;
        assert(numOffsets <= this.frameCount);
        // skip padding + flags
        this.seek(0x06A8);
        // read frame offsets and build them into a table
        const frameOffsets = new Uint32Array(numOffsets);
        for (let n = 0; n < numOffsets; n++) {
            const ptr = 0x06A8 + offsetTableLength + this.readUint32();
            assert(ptr < this.byteLength, `Frame ${n} pointer is out of bounds`);
            frameOffsets[n] = ptr;
        }
        this.frameOffsets = frameOffsets;
    }
    decodeSoundHeader() {
        // https://github.com/Flipnote-Collective/flipnote-studio-docs/wiki/PPM-format#sound-header
        let ptr = this.soundDataOffset;
        this.seek(ptr);
        const bgmLen = this.readUint32();
        const se1Len = this.readUint32();
        const se2Len = this.readUint32();
        const se3Len = this.readUint32();
        this.frameSpeed = 8 - this.readUint8();
        this.bgmSpeed = 8 - this.readUint8();
        assert(this.frameSpeed <= 8 && this.bgmSpeed <= 8);
        ptr += 32;
        this.framerate = PPM_FRAMERATES[this.frameSpeed];
        this.duration = timeGetNoteDuration(this.frameCount, this.framerate);
        this.bgmrate = PPM_FRAMERATES[this.bgmSpeed];
        const soundMeta = new Map();
        soundMeta.set(FlipnoteAudioTrack.BGM, { ptr: ptr, length: bgmLen });
        soundMeta.set(FlipnoteAudioTrack.SE1, { ptr: ptr += bgmLen, length: se1Len });
        soundMeta.set(FlipnoteAudioTrack.SE2, { ptr: ptr += se1Len, length: se2Len });
        soundMeta.set(FlipnoteAudioTrack.SE3, { ptr: ptr += se2Len, length: se3Len });
        this.soundMeta = soundMeta;
    }
    isKeyFrame(frameIndex) {
        assertRange(frameIndex, 0, this.frameCount - 1, 'Frame index');
        this.seek(this.frameOffsets[frameIndex]);
        const header = this.readUint8();
        return (header >> 7) & 0x1;
    }
    /**
     * Decode a frame, returning the raw pixel buffers for each layer
     * @category Image
    */
    decodeFrame(frameIndex) {
        assertRange(frameIndex, 0, this.frameCount - 1, 'Frame index');
        // return existing layer buffers if no new frame has been decoded since the last call
        if (this.prevDecodedFrame === frameIndex)
            return this.layerBuffers;
        // if necessary, decode previous frames until a keyframe is reached
        if (this.prevDecodedFrame !== frameIndex - 1 && (!this.isKeyFrame(frameIndex)) && frameIndex !== 0)
            this.decodeFrame(frameIndex - 1);
        this.prevDecodedFrame = frameIndex;
        // https://github.com/Flipnote-Collective/flipnote-studio-docs/wiki/PPM-format#animation-data
        this.seek(this.frameOffsets[frameIndex]);
        const header = this.readUint8();
        const isKeyFrame = (header >> 7) & 0x1;
        const isTranslated = (header >> 5) & 0x3;
        // reset current layer buffers
        this.layerBuffers[0].fill(0);
        this.layerBuffers[1].fill(0);
        let translateX = 0;
        let translateY = 0;
        if (isTranslated) {
            translateX = this.readInt8();
            translateY = this.readInt8();
        }
        // unpack line encodings for each layer
        for (let layerIndex = 0; layerIndex < 2; layerIndex++) {
            const lineEncodingBuffer = this.lineEncodingBuffers[layerIndex];
            lineEncodingBuffer.fill(0);
            for (let ptr = 0; ptr < lineEncodingBuffer.length;) {
                let byte = this.readUint8();
                // the 4 lines in this byte are all empty (type 0) - skip
                if (byte === 0) {
                    ptr += 4;
                    continue;
                }
                // unpack 4 line types from the current byte
                lineEncodingBuffer[ptr++] = byte & 0x03;
                lineEncodingBuffer[ptr++] = (byte >> 2) & 0x03;
                lineEncodingBuffer[ptr++] = (byte >> 4) & 0x03;
                lineEncodingBuffer[ptr++] = (byte >> 6) & 0x03;
            }
        }
        // unpack layer bitmaps
        for (let layerIndex = 0; layerIndex < 2; layerIndex++) {
            const pixelBuffer = this.layerBuffers[layerIndex];
            const lineEncodingBuffer = this.lineEncodingBuffers[layerIndex];
            for (let y = 0; y < PpmParser.height; y++) {
                let pixelBufferPtr = y * PpmParser.width;
                const lineType = lineEncodingBuffer[y];
                switch (lineType) {
                    // line type 0 = blank line, decode nothing
                    case 0:
                        break;
                    // line type 1 = compressed bitmap line
                    case 1:
                        // read lineHeader as a big-endian int
                        var lineHeader = this.readUint32(false);
                        // loop through each bit in the line header
                        // shift lineheader to the left by 1 bit every interation, 
                        // so on the next loop cycle the next bit will be checked
                        // and if the line header equals 0, no more bits are set, 
                        // the rest of the line is empty and can be skipped
                        for (; lineHeader !== 0; lineHeader <<= 1, pixelBufferPtr += 8) {
                            // if the bit is set, this 8-pix wide chunk is stored
                            // else we can just leave it blank and move on to the next chunk
                            if (lineHeader & 0x80000000) {
                                let chunk = this.readUint8();
                                // unpack chunk bits
                                // the chunk if shifted right 1 bit on every loop
                                // if the chunk equals 0, no more bits are set, 
                                // so the rest of the chunk is empty and can be skipped
                                for (let pixel = 0; chunk !== 0; pixel++, chunk >>= 1)
                                    pixelBuffer[pixelBufferPtr + pixel] = chunk & 0x1;
                            }
                        }
                        break;
                    // line type 2 = compressed bitmap line like type 1, but all pixels are set to 1 first
                    case 2:
                        // line type 2 starts as an inverted line
                        pixelBuffer.fill(1, pixelBufferPtr, pixelBufferPtr + PpmParser.width);
                        // read lineHeader as a big-endian int
                        var lineHeader = this.readUint32(false);
                        // loop through each bit in the line header
                        // shift lineheader to the left by 1 bit every interation, 
                        // so on the next loop cycle the next bit will be checked
                        // and if the line header equals 0, no more bits are set, 
                        // the rest of the line is empty and can be skipped
                        for (; lineHeader !== 0; lineHeader <<= 1, pixelBufferPtr += 8) {
                            // if the bit is set, this 8-pix wide chunk is stored
                            // else we can just leave it blank and move on to the next chunk
                            if (lineHeader & 0x80000000) {
                                let chunk = this.readUint8();
                                // unpack chunk bits
                                for (let pixel = 0; pixel < 8; pixel++, chunk >>= 1)
                                    pixelBuffer[pixelBufferPtr + pixel] = chunk & 0x1;
                            }
                        }
                        break;
                    // line type 3 = raw bitmap line
                    case 3:
                        for (let chunk = 0, i = 0; i < PpmParser.width; i++) {
                            if (i % 8 === 0)
                                chunk = this.readUint8();
                            pixelBuffer[pixelBufferPtr++] = chunk & 0x1;
                            chunk >>= 1;
                        }
                        break;
                }
            }
        }
        // if the current frame is based on changes from the preivous one, merge them by XORing their values
        const layer1 = this.layerBuffers[0];
        const layer2 = this.layerBuffers[1];
        const layer1Prev = this.prevLayerBuffers[0];
        const layer2Prev = this.prevLayerBuffers[1];
        // fast diffing if the frame isn't translated
        if (!isKeyFrame && translateX === 0 && translateY === 0) {
            const size = PpmParser.height * PpmParser.width;
            for (let i = 0; i < size; i++) {
                layer1[i] ^= layer1Prev[i];
                layer2[i] ^= layer2Prev[i];
            }
        }
        // slower diffing if the frame is translated
        else if (!isKeyFrame) {
            const w = PpmParser.width;
            const h = PpmParser.height;
            const startX = Math.max(translateX, 0);
            const startY = Math.max(translateY, 0);
            const endX = Math.min(w + translateX, w);
            const endY = Math.min(h + translateY, h);
            const shift = translateY * w + translateX;
            let dest, src;
            // loop through each line
            for (let y = startY; y < endY; y++) {
                // loop through each pixel in the line
                for (let x = startX; x < endX; x++) {
                    dest = y * w + x;
                    src = dest - shift;
                    // diff pixels with a binary XOR
                    layer1[dest] ^= layer1Prev[src];
                    layer2[dest] ^= layer2Prev[src];
                }
            }
        }
        // copy the current layer buffers to the previous ones
        this.prevLayerBuffers[0].set(this.layerBuffers[0]);
        this.prevLayerBuffers[1].set(this.layerBuffers[1]);
        return this.layerBuffers;
    }
    /**
     * Get the layer draw order for a given frame
     * @category Image
     * @returns Array of layer indexes, in the order they should be drawn
    */
    getFrameLayerOrder(frameIndex) {
        assertRange(frameIndex, 0, this.frameCount - 1, 'Frame index');
        return [1, 0];
    }
    /**
     * Get the color palette indices for a given frame. RGBA colors for these values can be indexed from {@link PpmParser.globalPalette}
     *
     * Returns an array where:
     *  - index 0 is the paper color index
     *  - index 1 is the layer 1 color index
     *  - index 2 is the layer 2 color index
     * @category Image
    */
    getFramePaletteIndices(frameIndex) {
        assertRange(frameIndex, 0, this.frameCount - 1, 'Frame index');
        this.seek(this.frameOffsets[frameIndex]);
        const header = this.readUint8();
        const isInverted = (header & 0x1) !== 1;
        const penMap = [
            isInverted ? 0 : 1,
            isInverted ? 0 : 1,
            2,
            3,
        ];
        return [
            isInverted ? 1 : 0,
            penMap[(header >> 1) & 0x3],
            penMap[(header >> 3) & 0x3],
        ];
    }
    /**
     * Get the RGBA colors for a given frame
     *
     * Returns an array where:
     *  - index 0 is the paper color
     *  - index 1 is the layer 1 color
     *  - index 2 is the layer 2 color
     * @category Image
     */
    getFramePalette(frameIndex) {
        assertRange(frameIndex, 0, this.frameCount - 1, 'Frame index');
        const indices = this.getFramePaletteIndices(frameIndex);
        return indices.map(colorIndex => this.globalPalette[colorIndex]);
    }
    /**
     * Get the sound effect flags for every frame in the Flipnote
     * @category Audio
    */
    decodeSoundFlags() {
        if (this.soundFlags !== undefined)
            return this.soundFlags;
        assert(0x06A0 + this.frameDataLength < this.byteLength);
        // https://github.com/Flipnote-Collective/flipnote-studio-docs/wiki/PPM-format#sound-effect-flags
        this.seek(0x06A0 + this.frameDataLength);
        const numFlags = this.frameCount;
        const flags = this.readBytes(numFlags);
        this.soundFlags = new Array(numFlags);
        for (let i = 0; i < numFlags; i++) {
            const byte = flags[i];
            this.soundFlags[i] = [
                (byte & 0x1) !== 0,
                (byte & 0x2) !== 0,
                (byte & 0x4) !== 0,
            ];
        }
        return this.soundFlags;
    }
    /**
     * Get the sound effect usage flags for every frame
     * @category Audio
     */
    getSoundEffectFlags() {
        return this.decodeSoundFlags().map(frameFlags => ({
            [FlipnoteSoundEffectTrack.SE1]: frameFlags[0],
            [FlipnoteSoundEffectTrack.SE2]: frameFlags[1],
            [FlipnoteSoundEffectTrack.SE3]: frameFlags[2]
        }));
    }
    /**
     * Get the sound effect usage flags for a given frame
     * @category Audio
     */
    getFrameSoundEffectFlags(frameIndex) {
        assertRange(frameIndex, 0, this.frameCount - 1, 'Frame index');
        this.seek(0x06A0 + this.frameDataLength + frameIndex);
        const byte = this.readUint8();
        return {
            [FlipnoteSoundEffectTrack.SE1]: (byte & 0x1) !== 0,
            [FlipnoteSoundEffectTrack.SE2]: (byte & 0x2) !== 0,
            [FlipnoteSoundEffectTrack.SE3]: (byte & 0x4) !== 0
        };
    }
    /**
     * Get the raw compressed audio data for a given track
     * @returns byte array
     * @category Audio
    */
    getAudioTrackRaw(trackId) {
        const trackMeta = this.soundMeta.get(trackId);
        assert(trackMeta.ptr + trackMeta.length < this.byteLength);
        this.seek(trackMeta.ptr);
        return this.readBytes(trackMeta.length);
    }
    /**
     * Get the decoded audio data for a given track, using the track's native samplerate
     * @returns Signed 16-bit PCM audio
     * @category Audio
    */
    decodeAudioTrack(trackId) {
        // note this doesn't resample
        // TODO: kinda slow, maybe use sample lookup table
        // decode a 4 bit IMA adpcm audio track
        // https://github.com/Flipnote-Collective/flipnote-studio-docs/wiki/PPM-format#sound-data
        const src = this.getAudioTrackRaw(trackId);
        const srcSize = src.length;
        const dst = new Int16Array(srcSize * 2);
        let srcPtr = 0;
        let dstPtr = 0;
        let sample = 0;
        let stepIndex = 0;
        let predictor = 0;
        let lowNibble = true;
        while (srcPtr < srcSize) {
            // switch between high and low nibble each loop iteration
            // increments srcPtr after every high nibble
            if (lowNibble)
                sample = src[srcPtr] & 0xF;
            else
                sample = src[srcPtr++] >> 4;
            lowNibble = !lowNibble;
            const step = ADPCM_STEP_TABLE[stepIndex];
            let diff = step >> 3;
            if (sample & 1)
                diff += step >> 2;
            if (sample & 2)
                diff += step >> 1;
            if (sample & 4)
                diff += step;
            if (sample & 8)
                diff = -diff;
            predictor += diff;
            predictor = clamp(predictor, -32768, 32767);
            stepIndex += ADPCM_INDEX_TABLE_4BIT[sample];
            stepIndex = clamp(stepIndex, 0, 88);
            dst[dstPtr++] = predictor;
        }
        return dst;
    }
    /**
     * Get the decoded audio data for a given track, using the specified samplerate
     * @returns Signed 16-bit PCM audio
     * @category Audio
    */
    getAudioTrackPcm(trackId, dstFreq = this.sampleRate) {
        const srcPcm = this.decodeAudioTrack(trackId);
        let srcFreq = this.rawSampleRate;
        if (trackId === FlipnoteAudioTrack.BGM) {
            const bgmAdjust = (1 / this.bgmrate) / (1 / this.framerate);
            srcFreq = this.rawSampleRate * bgmAdjust;
        }
        if (srcFreq !== dstFreq)
            return pcmResampleNearestNeighbour(srcPcm, srcFreq, dstFreq);
        return srcPcm;
    }
    pcmAudioMix(src, dst, dstOffset = 0) {
        const srcSize = src.length;
        const dstSize = dst.length;
        for (let n = 0; n < srcSize; n++) {
            if (dstOffset + n > dstSize)
                break;
            // half src volume
            const samp = dst[dstOffset + n] + (src[n] / 2);
            dst[dstOffset + n] = clamp(samp, -32768, 32767);
        }
    }
    /**
     * Get the full mixed audio for the Flipnote, using the specified samplerate
     * @returns Signed 16-bit PCM audio
     * @category Audio
    */
    getAudioMasterPcm(dstFreq = this.sampleRate) {
        const dstSize = Math.ceil(this.duration * dstFreq);
        const master = new Int16Array(dstSize);
        const hasBgm = this.hasAudioTrack(FlipnoteAudioTrack.BGM);
        const hasSe1 = this.hasAudioTrack(FlipnoteAudioTrack.SE1);
        const hasSe2 = this.hasAudioTrack(FlipnoteAudioTrack.SE2);
        const hasSe3 = this.hasAudioTrack(FlipnoteAudioTrack.SE3);
        // Mix background music
        if (hasBgm) {
            const bgmPcm = this.getAudioTrackPcm(FlipnoteAudioTrack.BGM, dstFreq);
            this.pcmAudioMix(bgmPcm, master, 0);
        }
        // Mix sound effects
        if (hasSe1 || hasSe2 || hasSe3) {
            const samplesPerFrame = dstFreq / this.framerate;
            const se1Pcm = hasSe1 ? this.getAudioTrackPcm(FlipnoteAudioTrack.SE1, dstFreq) : null;
            const se2Pcm = hasSe2 ? this.getAudioTrackPcm(FlipnoteAudioTrack.SE2, dstFreq) : null;
            const se3Pcm = hasSe3 ? this.getAudioTrackPcm(FlipnoteAudioTrack.SE3, dstFreq) : null;
            const seFlags = this.decodeSoundFlags();
            for (let frame = 0; frame < this.frameCount; frame++) {
                const seOffset = Math.ceil(frame * samplesPerFrame);
                const flag = seFlags[frame];
                if (hasSe1 && flag[0])
                    this.pcmAudioMix(se1Pcm, master, seOffset);
                if (hasSe2 && flag[1])
                    this.pcmAudioMix(se2Pcm, master, seOffset);
                if (hasSe3 && flag[2])
                    this.pcmAudioMix(se3Pcm, master, seOffset);
            }
        }
        this.audioClipRatio = pcmGetClippingRatio(master);
        return master;
    }
    /**
     * Get the body of the Flipnote - the data that is digested for the signature
     * @category Verification
     */
    getBody() {
        const bodyEnd = this.soundDataOffset + this.soundDataLength + 32;
        return this.bytes.subarray(0, bodyEnd);
    }
    /**
    * Get the Flipnote's signature data
    * @category Verification
    */
    getSignature() {
        const bodyEnd = this.soundDataOffset + this.soundDataLength + 32;
        return this.bytes.subarray(bodyEnd, bodyEnd + 128);
    }
    /**
     * Verify whether this Flipnote's signature is valid
     * @category Verification
     */
    async verify() {
        const key = await rsaLoadPublicKey(PPM_PUBLIC_KEY, 'SHA-1');
        return await rsaVerify(key, this.getSignature(), this.getBody());
    }
}
/** Default PPM parser settings */
PpmParser.defaultSettings = {};
/** File format type */
PpmParser.format = FlipnoteFormat.PPM;
/** Animation frame width */
PpmParser.width = 256;
/** Animation frame height */
PpmParser.height = 192;
/** Number of animation frame layers */
PpmParser.numLayers = 2;
/** Number of colors per layer (aside from transparent) */
PpmParser.numLayerColors = 1;
/** Audio track base sample rate */
PpmParser.rawSampleRate = 8192;
/** Nintendo DSi audio output rate */
PpmParser.sampleRate = 32768;
/** Which audio tracks are available in this format */
PpmParser.audioTracks = [
    FlipnoteAudioTrack.BGM,
    FlipnoteAudioTrack.SE1,
    FlipnoteAudioTrack.SE2,
    FlipnoteAudioTrack.SE3
];
/** Which sound effect tracks are available in this format */
PpmParser.soundEffectTracks = [
    FlipnoteSoundEffectTrack.SE1,
    FlipnoteSoundEffectTrack.SE2,
    FlipnoteSoundEffectTrack.SE3,
];
/** Global animation frame color palette */
PpmParser.globalPalette = [
    PPM_PALETTE.WHITE,
    PPM_PALETTE.BLACK,
    PPM_PALETTE.RED,
    PPM_PALETTE.BLUE
];
/** Public key used for Flipnote verification, in PEM format */
PpmParser.publicKey = PPM_PUBLIC_KEY;

/**
 * KWZ framerates in frames per second, indexed by the in-app frame speed
 */
const KWZ_FRAMERATES = [.2, .5, 1, 2, 4, 6, 8, 12, 20, 24, 30];
/**
 * KWZ color defines (red, green, blue, alpha)
 */
const KWZ_PALETTE = {
    WHITE: [0xff, 0xff, 0xff, 0xff],
    BLACK: [0x10, 0x10, 0x10, 0xff],
    RED: [0xff, 0x10, 0x10, 0xff],
    YELLOW: [0xff, 0xe7, 0x00, 0xff],
    GREEN: [0x00, 0x86, 0x31, 0xff],
    BLUE: [0x00, 0x38, 0xce, 0xff],
    NONE: [0xff, 0xff, 0xff, 0x00]
};
/**
 * RSA public key used to verify that the KWZ file signature is genuine.
 *
 * This **cannot** be used to resign Flipnotes, it can only verify that they are valid
 */
const KWZ_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuv+zHAXXvbbtRqxADDeJ
ArX2b9RMxj3T+qpRg3FnIE/jeU3tj7eoDzsMduY+D/UT9CSnP+QHYY/vf0n5lqX9
s6ljoZAmyUuruyj1e5Bg+fkDEu/yPEPQjqhbyywCyYL4TEAOJveopUBx9fdQxUJ6
J4J5oCE/Im1kFrlGW+puARiHmt3mmUyNzO8bI/Jx3cGSfoOHJG1foEaQsI5aaKqA
pBqxtzvwqMhudcZtAWSyRMBMlndvkRnVTDNTfTXLOYdHShCIgnKULCTH87uLBIP/
nsmr4/bnQz8q2rp/HyVO+0yjR6mVr0NX5APJQ+6riJmGg3t3VOldhKP7aTHDUW+h
kQIDAQAB
-----END PUBLIC KEY-----`;
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
                            for (let h = 0; h < 3; h++) {
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
 * Parser class for Flipnote Studio 3D's KWZ animation format
 *
 * KWZ format docs: https://github.com/Flipnote-Collective/flipnote-studio-3d-docs/wiki/KWZ-Format
 * @category File Parser
 */
class KwzParser extends FlipnoteParserBase {
    /**
     * Create a new KWZ file parser instance
     * @param arrayBuffer an ArrayBuffer containing file data
     * @param settings parser settings
     */
    constructor(arrayBuffer, settings = {}) {
        super(arrayBuffer);
        /** File format type, reflects {@link KwzParser.format} */
        this.format = FlipnoteFormat.KWZ;
        /** Custom object tag */
        this[Symbol.toStringTag] = 'Flipnote Studio 3D KWZ animation file';
        /** Animation frame width, reflects {@link KwzParser.width} */
        this.imageWidth = KwzParser.width;
        /** Animation frame height, reflects {@link KwzParser.height} */
        this.imageHeight = KwzParser.height;
        /** X offset for the top-left corner of the animation frame */
        this.imageOffsetX = 0;
        /** Y offset for the top-left corner of the animation frame */
        this.imageOffsetY = 0;
        /** Number of animation frame layers, reflects {@link KwzParser.numLayers} */
        this.numLayers = KwzParser.numLayers;
        /** Number of colors per layer (aside from transparent), reflects {@link KwzParser.numLayerColors} */
        this.numLayerColors = KwzParser.numLayerColors;
        /** key used for Flipnote verification, in PEM format */
        this.publicKey = KwzParser.publicKey;
        /** @internal */
        this.srcWidth = KwzParser.width;
        /** Which audio tracks are available in this format, reflects {@link KwzParser.audioTracks} */
        this.audioTracks = KwzParser.audioTracks;
        /** Which sound effect tracks are available in this format, reflects {@link KwzParser.soundEffectTracks} */
        this.soundEffectTracks = KwzParser.soundEffectTracks;
        /** Audio track base sample rate, reflects {@link KwzParser.rawSampleRate} */
        this.rawSampleRate = KwzParser.rawSampleRate;
        /** Audio output sample rate, reflects {@link KwzParser.sampleRate} */
        this.sampleRate = KwzParser.sampleRate;
        /** Global animation frame color palette, reflects {@link KwzParser.globalPalette} */
        this.globalPalette = KwzParser.globalPalette;
        this.prevDecodedFrame = null;
        this.bitIndex = 0;
        this.bitValue = 0;
        this.settings = { ...KwzParser.defaultSettings, ...settings };
        this.layerBuffers = [
            new Uint8Array(KwzParser.width * KwzParser.height),
            new Uint8Array(KwzParser.width * KwzParser.height),
            new Uint8Array(KwzParser.width * KwzParser.height),
        ];
        // skip through the file and read all of the section headers so we can locate them
        this.buildSectionMap();
        // if the KIC section is present, we're dealing with a folder icon
        // these are single-frame KWZs without a KFH section for metadata, or a KSN section for sound
        // while the data for a full frame (320*240) is present, only the top-left 24*24 pixels are used
        if (this.sectionMap.has('KIC')) {
            this.isFolderIcon = true;
            // icons still use the full 320 * 240 frame size, so we just set up our image crop to deal with that
            this.imageWidth = 24;
            this.imageHeight = 24;
            this.frameCount = 1;
            this.frameSpeed = 0;
            this.framerate = KWZ_FRAMERATES[0];
            this.thumbFrameIndex = 0;
            this.getFrameOffsets();
        }
        // if the KSN section is not present, then this is a handwritten comment from the Flipnote Gallery World online service
        // these are single-frame KWZs, just with no sound
        else if (!this.sectionMap.has('KSN')) {
            this.isComment = true;
            this.decodeMeta();
            this.getFrameOffsets();
        }
        // else let's assume this is a regular note
        else {
            this.decodeMeta();
            this.getFrameOffsets();
            this.decodeSoundHeader();
        }
        // apply special optimisations for converted DSi library notes
        if (this.settings.dsiLibraryNote) {
            this.isDsiLibraryNote = true;
        }
        // automatically crop out the border around every frame
        if (this.settings.borderCrop) {
            // dsi library notes can be cropped to their original resolution
            if (this.isDsiLibraryNote) {
                this.imageOffsetX = 32;
                this.imageOffsetY = 24;
                this.imageWidth = 256;
                this.imageHeight = 192;
            }
            // even standard notes have a bit of a border...
            else if (!this.isFolderIcon) {
                this.imageOffsetX = 5;
                this.imageOffsetY = 5;
                this.imageWidth = 310;
                this.imageHeight = 230;
            }
        }
    }
    buildSectionMap() {
        const fileSize = this.byteLength - 256;
        const sectionMap = new Map();
        let sectionCount = 0;
        let ptr = 0;
        // counting sections should mitigate against one of mrnbayoh's notehax exploits
        while (ptr < fileSize && sectionCount < 6) {
            this.seek(ptr);
            const magic = this.readChars(4).substring(0, 3);
            const length = this.readUint32();
            sectionMap.set(magic, { ptr, length });
            ptr += length + 8;
            sectionCount += 1;
        }
        this.bodyEndOffset = ptr;
        this.sectionMap = sectionMap;
        assert(sectionMap.has('KMC') && sectionMap.has('KMI'));
    }
    readBits(num) {
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
    readFsid() {
        if (this.settings.dsiLibraryNote) { // format as DSi PPM FSID
            const hex = this.readHex(10, true);
            return hex.slice(2, 18);
        }
        const hex = this.readHex(10);
        return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 18)}`.toLowerCase();
    }
    readFilename() {
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
        return `${mac}_${random}_${edits}`;
    }
    decodeMeta() {
        if (this.settings.quickMeta)
            return this.decodeMetaQuick();
        assert(this.sectionMap.has('KFH'));
        this.seek(this.sectionMap.get('KFH').ptr + 12);
        const creationTime = dateFromNintendoTimestamp(this.readUint32());
        const modifiedTime = dateFromNintendoTimestamp(this.readUint32());
        // const simonTime = 
        this.readUint32();
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
        // Try to auto-detect whether the current author ID matches a converted PPM ID
        // if (isKwzDsiLibraryFsid(currentAuthorId)) {
        //   this.isDsiLibraryNote = true;
        // }
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
                region: getKwzFsidRegion(rootAuthorId),
                filename: rootFilename,
                isDsiFilename: rootFilename.length !== 28
            },
            parent: {
                username: parentAuthorName,
                fsid: parentAuthorId,
                region: getKwzFsidRegion(parentAuthorId),
                filename: parentFilename,
                isDsiFilename: parentFilename.length !== 28
            },
            current: {
                username: currentAuthorName,
                fsid: currentAuthorId,
                region: getKwzFsidRegion(currentAuthorId),
                filename: currentFilename,
                isDsiFilename: currentFilename.length !== 28
            },
        };
    }
    decodeMetaQuick() {
        assert(this.sectionMap.has('KFH'));
        this.seek(this.sectionMap.get('KFH').ptr + 0x8 + 0xC4);
        const frameCount = this.readUint16();
        const thumbFrameIndex = this.readUint16();
        this.readUint16();
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
    getFrameOffsets() {
        assert(this.sectionMap.has('KMI') && this.sectionMap.has('KMC'));
        const numFrames = this.frameCount;
        const kmiSection = this.sectionMap.get('KMI');
        const kmcSection = this.sectionMap.get('KMC');
        assert(kmiSection.length / 28 >= numFrames);
        const frameMetaOffsets = new Uint32Array(numFrames);
        const frameDataOffsets = new Uint32Array(numFrames);
        const frameLayerSizes = [];
        let frameMetaPtr = kmiSection.ptr + 8;
        let frameDataPtr = kmcSection.ptr + 12;
        for (let frameIndex = 0; frameIndex < numFrames; frameIndex++) {
            this.seek(frameMetaPtr + 4);
            const layerASize = this.readUint16();
            const layerBSize = this.readUint16();
            const layerCSize = this.readUint16();
            frameMetaOffsets[frameIndex] = frameMetaPtr;
            frameDataOffsets[frameIndex] = frameDataPtr;
            frameMetaPtr += 28;
            frameDataPtr += layerASize + layerBSize + layerCSize;
            assert(frameMetaPtr < this.byteLength, `frame${frameIndex} meta pointer out of bounds`);
            assert(frameDataPtr < this.byteLength, `frame${frameIndex} data pointer out of bounds`);
            frameLayerSizes.push([layerASize, layerBSize, layerCSize]);
        }
        this.frameMetaOffsets = frameMetaOffsets;
        this.frameDataOffsets = frameDataOffsets;
        this.frameLayerSizes = frameLayerSizes;
    }
    decodeSoundHeader() {
        assert(this.sectionMap.has('KSN'));
        let ptr = this.sectionMap.get('KSN').ptr + 8;
        this.seek(ptr);
        this.bgmSpeed = this.readUint32();
        assert(this.bgmSpeed <= 10);
        this.bgmrate = KWZ_FRAMERATES[this.bgmSpeed];
        const trackSizes = new Uint32Array(this.buffer, ptr + 4, 20);
        const soundMeta = new Map();
        soundMeta.set(FlipnoteAudioTrack.BGM, { ptr: ptr += 28, length: trackSizes[0] });
        soundMeta.set(FlipnoteAudioTrack.SE1, { ptr: ptr += trackSizes[0], length: trackSizes[1] });
        soundMeta.set(FlipnoteAudioTrack.SE2, { ptr: ptr += trackSizes[1], length: trackSizes[2] });
        soundMeta.set(FlipnoteAudioTrack.SE3, { ptr: ptr += trackSizes[2], length: trackSizes[3] });
        soundMeta.set(FlipnoteAudioTrack.SE4, { ptr: ptr += trackSizes[3], length: trackSizes[4] });
        this.soundMeta = soundMeta;
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
    getFramePaletteIndices(frameIndex) {
        assertRange(frameIndex, 0, this.frameCount - 1, 'Frame index');
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
    getFramePalette(frameIndex) {
        assertRange(frameIndex, 0, this.frameCount - 1, 'Frame index');
        const indices = this.getFramePaletteIndices(frameIndex);
        return indices.map(colorIndex => this.globalPalette[colorIndex]);
    }
    getFrameDiffingFlag(frameIndex) {
        assertRange(frameIndex, 0, this.frameCount - 1, 'Frame index');
        this.seek(this.frameMetaOffsets[frameIndex]);
        const flags = this.readUint32();
        return (flags >> 4) & 0x07;
    }
    getFrameLayerSizes(frameIndex) {
        assertRange(frameIndex, 0, this.frameCount - 1, 'Frame index');
        this.seek(this.frameMetaOffsets[frameIndex] + 0x4);
        return [
            this.readUint16(),
            this.readUint16(),
            this.readUint16()
        ];
    }
    getFrameLayerDepths(frameIndex) {
        assertRange(frameIndex, 0, this.frameCount - 1, 'Frame index');
        this.seek(this.frameMetaOffsets[frameIndex] + 0x14);
        const a = [
            this.readUint8(),
            this.readUint8(),
            this.readUint8()
        ];
        return a;
    }
    getFrameAuthor(frameIndex) {
        assertRange(frameIndex, 0, this.frameCount - 1, 'Frame index');
        this.seek(this.frameMetaOffsets[frameIndex] + 0xA);
        return this.readFsid();
    }
    decodeFrameSoundFlags(frameIndex) {
        assertRange(frameIndex, 0, this.frameCount - 1, 'Frame index');
        this.seek(this.frameMetaOffsets[frameIndex] + 0x17);
        const soundFlags = this.readUint8();
        return [
            (soundFlags & 0x1) !== 0,
            (soundFlags & 0x2) !== 0,
            (soundFlags & 0x4) !== 0,
            (soundFlags & 0x8) !== 0,
        ];
    }
    getFrameCameraFlags(frameIndex) {
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
    getFrameLayerOrder(frameIndex) {
        assertRange(frameIndex, 0, this.frameCount - 1, 'Frame index');
        const depths = this.getFrameLayerDepths(frameIndex);
        return [2, 1, 0].sort((a, b) => depths[b] - depths[a]);
    }
    /**
     * Decode a frame, returning the raw pixel buffers for each layer
     * @category Image
    */
    decodeFrame(frameIndex, diffingFlag = 0x7, isPrevFrame = false) {
        assertRange(frameIndex, 0, this.frameCount - 1, 'Frame index');
        // return existing layer buffers if no new frame has been decoded since the last call
        if (this.prevDecodedFrame === frameIndex)
            return this.layerBuffers;
        // the prevDecodedFrame check is an optimisation for decoding frames in full sequence
        if (this.prevDecodedFrame !== frameIndex - 1 && frameIndex !== 0) {
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
            const pixelBuffer = this.layerBuffers[layerIndex];
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
                                    pattern += 1;
                                }
                                else {
                                    const linePtrA = this.readBits(13) * 8;
                                    const linePtrB = this.readBits(13) * 8;
                                    a = KWZ_LINE_TABLE.subarray(linePtrA, linePtrA + 8);
                                    b = KWZ_LINE_TABLE.subarray(linePtrB, linePtrB + 8);
                                }
                                switch (pattern % 4) {
                                    case 0:
                                        pixelBuffer.set(a, pixelBufferPtr);
                                        pixelBuffer.set(b, pixelBufferPtr += 320);
                                        pixelBuffer.set(a, pixelBufferPtr += 320);
                                        pixelBuffer.set(b, pixelBufferPtr += 320);
                                        pixelBuffer.set(a, pixelBufferPtr += 320);
                                        pixelBuffer.set(b, pixelBufferPtr += 320);
                                        pixelBuffer.set(a, pixelBufferPtr += 320);
                                        pixelBuffer.set(b, pixelBufferPtr += 320);
                                        break;
                                    case 1:
                                        pixelBuffer.set(a, pixelBufferPtr);
                                        pixelBuffer.set(a, pixelBufferPtr += 320);
                                        pixelBuffer.set(b, pixelBufferPtr += 320);
                                        pixelBuffer.set(a, pixelBufferPtr += 320);
                                        pixelBuffer.set(a, pixelBufferPtr += 320);
                                        pixelBuffer.set(b, pixelBufferPtr += 320);
                                        pixelBuffer.set(a, pixelBufferPtr += 320);
                                        pixelBuffer.set(a, pixelBufferPtr += 320);
                                        break;
                                    case 2:
                                        pixelBuffer.set(a, pixelBufferPtr);
                                        pixelBuffer.set(b, pixelBufferPtr += 320);
                                        pixelBuffer.set(a, pixelBufferPtr += 320);
                                        pixelBuffer.set(a, pixelBufferPtr += 320);
                                        pixelBuffer.set(b, pixelBufferPtr += 320);
                                        pixelBuffer.set(a, pixelBufferPtr += 320);
                                        pixelBuffer.set(a, pixelBufferPtr += 320);
                                        pixelBuffer.set(b, pixelBufferPtr += 320);
                                        break;
                                    case 3:
                                        pixelBuffer.set(a, pixelBufferPtr);
                                        pixelBuffer.set(b, pixelBufferPtr += 320);
                                        pixelBuffer.set(b, pixelBufferPtr += 320);
                                        pixelBuffer.set(a, pixelBufferPtr += 320);
                                        pixelBuffer.set(b, pixelBufferPtr += 320);
                                        pixelBuffer.set(b, pixelBufferPtr += 320);
                                        pixelBuffer.set(a, pixelBufferPtr += 320);
                                        pixelBuffer.set(b, pixelBufferPtr += 320);
                                        break;
                                }
                            }
                        }
                    }
                }
            }
        }
        this.prevDecodedFrame = frameIndex;
        return this.layerBuffers;
    }
    /**
     * Get the sound effect flags for every frame in the Flipnote
     * @category Audio
    */
    decodeSoundFlags() {
        if (this.soundFlags !== undefined)
            return this.soundFlags;
        this.soundFlags = new Array(this.frameCount)
            .fill(false)
            .map((_, i) => this.decodeFrameSoundFlags(i));
        return this.soundFlags;
    }
    /**
     * Get the sound effect usage flags for every frame
     * @category Audio
     */
    getSoundEffectFlags() {
        return this.decodeSoundFlags().map((frameFlags) => ({
            [FlipnoteSoundEffectTrack.SE1]: frameFlags[0],
            [FlipnoteSoundEffectTrack.SE2]: frameFlags[1],
            [FlipnoteSoundEffectTrack.SE3]: frameFlags[2],
            [FlipnoteSoundEffectTrack.SE4]: frameFlags[3],
        }));
    }
    /**
     * Get the sound effect usage for a given frame
     * @param frameIndex
     * @category Audio
     */
    getFrameSoundEffectFlags(frameIndex) {
        const frameFlags = this.decodeFrameSoundFlags(frameIndex);
        return {
            [FlipnoteSoundEffectTrack.SE1]: frameFlags[0],
            [FlipnoteSoundEffectTrack.SE2]: frameFlags[1],
            [FlipnoteSoundEffectTrack.SE3]: frameFlags[2],
            [FlipnoteSoundEffectTrack.SE4]: frameFlags[3],
        };
    }
    /**
     * Get the raw compressed audio data for a given track
     * @returns Byte array
     * @category Audio
    */
    getAudioTrackRaw(trackId) {
        const trackMeta = this.soundMeta.get(trackId);
        assert(trackMeta.ptr + trackMeta.length < this.byteLength);
        return new Uint8Array(this.buffer, trackMeta.ptr, trackMeta.length);
    }
    decodeAdpcm(src, dst, predictor = 0, stepIndex = 0) {
        const srcSize = src.length;
        let dstPtr = 0;
        let sample = 0;
        let step = 0;
        let diff = 0;
        // loop through each byte in the raw adpcm data
        for (let srcPtr = 0; srcPtr < srcSize; srcPtr++) {
            let currByte = src[srcPtr];
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
                dst[dstPtr] = predictor * 16;
                dstPtr += 1;
            }
        }
        return dstPtr;
    }
    /**
     * Get the decoded audio data for a given track, using the track's native samplerate
     * @returns Signed 16-bit PCM audio
     * @category Audio
    */
    decodeAudioTrack(trackId) {
        const settings = this.settings;
        const src = this.getAudioTrackRaw(trackId);
        const dstSize = this.rawSampleRate * 60; // enough for 60 seconds, the max bgm size
        const dst = new Int16Array(dstSize);
        // initial decoder state
        let predictor = 0;
        let stepIndex = 40;
        // Nintendo messed up the initial adpcm state for a bunch of the PPM conversions on DSi Library
        // they are effectively random, so you can optionally provide your own state values, or let the lib make a best guess
        if (this.isDsiLibraryNote) {
            if (trackId === FlipnoteAudioTrack.BGM) {
                // allow manual overrides for default predictor
                if (settings.initialBgmPredictor !== null)
                    predictor = settings.initialBgmPredictor;
                // allow manual overrides for default step index
                if (settings.initialBgmStepIndex !== null)
                    stepIndex = settings.initialBgmStepIndex;
                // bruteforce step index by finding the lowest track root mean square 
                if (settings.guessInitialBgmState) {
                    let bestRms = 0xFFFFFFFF; // arbritrarily large
                    let bestStepIndex = 0;
                    for (stepIndex = 0; stepIndex <= 40; stepIndex++) {
                        const dstPtr = this.decodeAdpcm(src, dst, predictor, stepIndex);
                        const rms = pcmGetRms(dst.subarray(0, dstPtr)); // uses same underlying memory as dst
                        if (rms < bestRms) {
                            bestRms = rms;
                            bestStepIndex = stepIndex;
                        }
                    }
                    stepIndex = bestStepIndex;
                }
            }
            else {
                const trackIndex = this.soundEffectTracks.indexOf(trackId);
                // allow manual overrides for default predictor
                if (Array.isArray(settings.initialSePredictors) && settings.initialSePredictors[trackIndex] !== undefined)
                    predictor = settings.initialSePredictors[trackIndex];
                // allow manual overrides for default step index
                if (Array.isArray(settings.initialSeStepIndices) && settings.initialSeStepIndices[trackIndex] !== undefined)
                    stepIndex = settings.initialSeStepIndices[trackIndex];
            }
        }
        // decode track
        const dstPtr = this.decodeAdpcm(src, dst, predictor, stepIndex);
        // copy part of dst with slice() so dst buffer can be garbage collected
        return dst.slice(0, dstPtr);
    }
    /**
     * Get the decoded audio data for a given track, using the specified samplerate
     * @returns Signed 16-bit PCM audio
     * @category Audio
    */
    getAudioTrackPcm(trackId, dstFreq = this.sampleRate) {
        const srcPcm = this.decodeAudioTrack(trackId);
        let srcFreq = this.rawSampleRate;
        if (trackId === FlipnoteAudioTrack.BGM) {
            const bgmAdjust = (1 / this.bgmrate) / (1 / this.framerate);
            srcFreq = this.rawSampleRate * bgmAdjust;
        }
        if (srcFreq !== dstFreq)
            return pcmResampleLinear(srcPcm, srcFreq, dstFreq);
        return srcPcm;
    }
    pcmAudioMix(src, dst, dstOffset = 0) {
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
    getAudioMasterPcm(dstFreq = this.sampleRate) {
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
            const soundEffectFlags = this.decodeSoundFlags();
            for (let i = 0; i < this.frameCount; i++) {
                const seFlags = soundEffectFlags[i];
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
    /**
     * Get the body of the Flipnote - the data that is digested for the signature
     * @category Verification
     */
    getBody() {
        const bodyEnd = this.bodyEndOffset;
        return this.bytes.subarray(0, bodyEnd);
    }
    /**
     * Get the Flipnote's signature data
     * @category Verification
     */
    getSignature() {
        const bodyEnd = this.bodyEndOffset;
        return this.bytes.subarray(bodyEnd, bodyEnd + 256);
    }
    /**
     * Verify whether this Flipnote's signature is valid
     * @category Verification
     */
    async verify() {
        const key = await rsaLoadPublicKey(KWZ_PUBLIC_KEY, 'SHA-256');
        return await rsaVerify(key, this.getSignature(), this.getBody());
    }
}
/** Default KWZ parser settings */
KwzParser.defaultSettings = {
    quickMeta: false,
    dsiLibraryNote: false,
    borderCrop: false,
    guessInitialBgmState: true,
    initialBgmPredictor: null,
    initialBgmStepIndex: null,
    initialSePredictors: null,
    initialSeStepIndices: null,
};
/** File format type */
KwzParser.format = FlipnoteFormat.KWZ;
/** Animation frame width */
KwzParser.width = 320;
/** Animation frame height */
KwzParser.height = 240;
/** Number of animation frame layers */
KwzParser.numLayers = 3;
/** Number of colors per layer (aside from transparent) */
KwzParser.numLayerColors = 2;
/** Audio track base sample rate */
KwzParser.rawSampleRate = 16364;
/** Audio output sample rate. NOTE: probably isn't accurate, full KWZ audio stack is still on the todo */
KwzParser.sampleRate = 32768;
/** Which audio tracks are available in this format */
KwzParser.audioTracks = [
    FlipnoteAudioTrack.BGM,
    FlipnoteAudioTrack.SE1,
    FlipnoteAudioTrack.SE2,
    FlipnoteAudioTrack.SE3,
    FlipnoteAudioTrack.SE4,
];
/** Which sound effect tracks are available in this format */
KwzParser.soundEffectTracks = [
    FlipnoteSoundEffectTrack.SE1,
    FlipnoteSoundEffectTrack.SE2,
    FlipnoteSoundEffectTrack.SE3,
    FlipnoteSoundEffectTrack.SE4,
];
/** Global animation frame color palette */
KwzParser.globalPalette = [
    KWZ_PALETTE.WHITE,
    KWZ_PALETTE.BLACK,
    KWZ_PALETTE.RED,
    KWZ_PALETTE.YELLOW,
    KWZ_PALETTE.GREEN,
    KWZ_PALETTE.BLUE,
    KWZ_PALETTE.NONE,
];
/** Public key used for Flipnote verification, in PEM format */
KwzParser.publicKey = KWZ_PUBLIC_KEY;

/**
 * Loader for web url strings (Browser only)
 * @internal
 */
const webUrlLoader = {
    matches: function (source) {
        return isBrowser && typeof source === 'string';
    },
    load: function (source, resolve, reject) {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', source, true);
        xhr.responseType = 'arraybuffer';
        xhr.onreadystatechange = function (e) {
            if (xhr.readyState === 4) {
                if (xhr.status >= 200 && xhr.status < 300)
                    resolve(xhr.response);
                else
                    reject({
                        type: 'httpError',
                        status: xhr.status,
                        statusText: xhr.statusText
                    });
            }
        };
        xhr.send(null);
    }
};

/**
 * Loader for web url strings (Node only)
 * @internal
 */
const nodeUrlLoader = {
    matches: function (source) {
        return isNode && typeof source === 'string';
    },
    load: function (source, resolve, reject) {
        assertNodeEnv();
        const http = dynamicRequire(module, 'https');
        http.get(source, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(buffer.buffer);
            });
            res.on('error', (err) => reject(err));
        });
    }
};

/**
 * Loader for File objects (browser only)
 * @internal
 */
const fileLoader = {
    matches: function (source) {
        return isBrowser
            && typeof File !== 'undefined'
            && typeof FileReader !== 'undefined'
            && source instanceof File;
    },
    load: function (source, resolve, reject) {
        const reader = new FileReader();
        reader.onload = (event) => {
            resolve(reader.result);
        };
        reader.onerror = (event) => {
            reject({ type: 'fileReadError' });
        };
        reader.readAsArrayBuffer(source);
    }
};

/**
 * Loader for Blob objects (browser only)
 * @internal
 */
const blobLoader = {
    matches: function (source) {
        return isBrowser
            && typeof Blob !== 'undefined'
            && typeof Response !== 'undefined'
            && source instanceof Blob;
    },
    load: function (source, resolve, reject) {
        // https://stackoverflow.com/questions/15341912/how-to-go-from-blob-to-arraybuffer
        new Response(source).arrayBuffer()
            .then(resolve)
            .catch(reject);
    }
};

/**
 * Loader for Buffer objects (Node only)
 * @internal
 */
const nodeBufferLoader = {
    matches: function (source) {
        return isNode && (source instanceof Buffer);
    },
    load: function (source, resolve, reject) {
        resolve(source.buffer);
    }
};

/**
 * Loader for ArrayBuffer objects
 * @internal
 */
const arrayBufferLoader = {
    matches: function (source) {
        return (source instanceof ArrayBuffer);
    },
    load: function (source, resolve, reject) {
        resolve(source);
    }
};

/** @internal */
const loaders = [
    webUrlLoader,
    nodeUrlLoader,
    fileLoader,
    blobLoader,
    nodeBufferLoader,
    arrayBufferLoader
];
/** @internal */
function loadSource(source) {
    return new Promise((resolve, reject) => {
        for (let i = 0; i < loaders.length; i++) {
            const loader = loaders[i];
            if (loader.matches(source))
                return loader.load(source, resolve, reject);
        }
        reject('No loader available for source type');
    });
}

/**
 * Load a Flipnote from a given source, returning a promise with a parser object.
 * It will auto-detect the Flipnote format and return either a {@link PpmParser} or {@link KwzParser} accordingly.
 *
 * @param source - Source to load a Flipnote from. Depending on the operating envionment, this can be:
 * - A string representing a web URL
 * - An {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer | ArrayBuffer}
 * - A {@link https://developer.mozilla.org/en-US/docs/Web/API/File | File} object (Browser only)
 * - A {@link https://nodejs.org/api/buffer.html | Buffer} object (NodeJS only)
 * @param parserConfig - Config settings to pass to the parser, see {@link FlipnoteParserSettings}
 */
function parseSource(source, parserConfig) {
    return loadSource(source)
        .then((arrayBuffer) => {
        return new Promise((resolve, reject) => {
            // check the buffer's magic to identify which format it uses
            const magicBytes = new Uint8Array(arrayBuffer.slice(0, 4));
            const magic = (magicBytes[0] << 24) | (magicBytes[1] << 16) | (magicBytes[2] << 8) | magicBytes[3];
            // check if magic is PARA (ppm magic)
            if (magic === 0x50415241)
                resolve(new PpmParser(arrayBuffer, parserConfig));
            // check if magic is KFH (kwz magic)
            else if ((magic & 0xFFFFFF00) === 0x4B464800)
                resolve(new KwzParser(arrayBuffer, parserConfig));
            // check if magic is KIC (fs3d folder icon)
            else if ((magic & 0xFFFFFF00) === 0x4B494300)
                resolve(new KwzParser(arrayBuffer, parserConfig));
            else
                reject('Could not identify source as a valid Flipnote file');
        });
    });
}

/**
 * Player event types
 */
var PlayerEvent;
(function (PlayerEvent) {
    PlayerEvent["__Any"] = "any";
    PlayerEvent["Play"] = "play";
    PlayerEvent["Pause"] = "pause";
    PlayerEvent["CanPlay"] = "canplay";
    PlayerEvent["CanPlayThrough"] = "canplaythrough";
    PlayerEvent["SeekStart"] = "seeking";
    PlayerEvent["SeekEnd"] = "seeked";
    PlayerEvent["Duration"] = "durationchange";
    PlayerEvent["Loop"] = "loop";
    PlayerEvent["Ended"] = "ended";
    PlayerEvent["VolumeChange"] = "volumechange";
    PlayerEvent["Progress"] = "progress";
    PlayerEvent["TimeUpdate"] = "timeupdate";
    PlayerEvent["FrameUpdate"] = "frameupdate";
    PlayerEvent["FrameNext"] = "framenext";
    PlayerEvent["FramePrev"] = "frameprev";
    PlayerEvent["FrameFirst"] = "framefirst";
    PlayerEvent["FrameLast"] = "framelast";
    PlayerEvent["Ready"] = "ready";
    PlayerEvent["Load"] = "load";
    PlayerEvent["LoadStart"] = "loadstart";
    PlayerEvent["LoadedData"] = "loadeddata";
    PlayerEvent["LoadedMeta"] = "loadedmetadata";
    PlayerEvent["Emptied"] = "emptied";
    PlayerEvent["Close"] = "close";
    PlayerEvent["Error"] = "error";
    PlayerEvent["Destroy"] = "destroy";
})(PlayerEvent || (PlayerEvent = {}));
/** @internal */
const supportedEvents = [
    PlayerEvent.Play,
    PlayerEvent.Pause,
    PlayerEvent.CanPlay,
    PlayerEvent.CanPlayThrough,
    PlayerEvent.SeekStart,
    PlayerEvent.SeekEnd,
    PlayerEvent.Duration,
    PlayerEvent.Loop,
    PlayerEvent.Ended,
    PlayerEvent.VolumeChange,
    PlayerEvent.Progress,
    PlayerEvent.TimeUpdate,
    PlayerEvent.FrameUpdate,
    PlayerEvent.FrameNext,
    PlayerEvent.FramePrev,
    PlayerEvent.FrameFirst,
    PlayerEvent.FrameLast,
    PlayerEvent.Ready,
    PlayerEvent.Load,
    PlayerEvent.LoadStart,
    PlayerEvent.LoadedData,
    PlayerEvent.LoadedMeta,
    PlayerEvent.Emptied,
    PlayerEvent.Close,
    PlayerEvent.Error,
];

/** @internal */
function createTimeRanges(ranges) {
    return {
        length: ranges.length,
        start: (i) => ranges[i][0],
        end: (i) => ranges[i][1],
    };
}
/** @internal */
function padNumber(num, strLength) {
    return num.toString().padStart(strLength, '0');
}
/** @internal */
function formatTime(seconds) {
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${padNumber(s, 2)}`;
}

/** @internal */
class CanvasInterface {
    constructor(parent, width, height) { }
}

/* @license twgl.js 4.21.2 Copyright (c) 2015, Gregg Tavares All Rights Reserved.
Available via the MIT license.
see: http://github.com/greggman/twgl.js for details */

/*
 * Copyright 2019 Gregg Tavares
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

/* DataType */
const BYTE                           = 0x1400;
const UNSIGNED_BYTE                  = 0x1401;
const SHORT                          = 0x1402;
const UNSIGNED_SHORT                 = 0x1403;
const INT                            = 0x1404;
const UNSIGNED_INT                   = 0x1405;
const FLOAT                          = 0x1406;

/**
 * Get the GL type for a typedArray
 * @param {ArrayBufferView} typedArray a typedArray
 * @return {number} the GL type for array. For example pass in an `Int8Array` and `gl.BYTE` will
 *   be returned. Pass in a `Uint32Array` and `gl.UNSIGNED_INT` will be returned
 * @memberOf module:twgl/typedArray
 */
function getGLTypeForTypedArray(typedArray) {
  if (typedArray instanceof Int8Array)         { return BYTE; }           // eslint-disable-line
  if (typedArray instanceof Uint8Array)        { return UNSIGNED_BYTE; }  // eslint-disable-line
  if (typedArray instanceof Uint8ClampedArray) { return UNSIGNED_BYTE; }  // eslint-disable-line
  if (typedArray instanceof Int16Array)        { return SHORT; }          // eslint-disable-line
  if (typedArray instanceof Uint16Array)       { return UNSIGNED_SHORT; } // eslint-disable-line
  if (typedArray instanceof Int32Array)        { return INT; }            // eslint-disable-line
  if (typedArray instanceof Uint32Array)       { return UNSIGNED_INT; }   // eslint-disable-line
  if (typedArray instanceof Float32Array)      { return FLOAT; }          // eslint-disable-line
  throw new Error('unsupported typed array type');
}

/**
 * Get the GL type for a typedArray type
 * @param {ArrayBufferView} typedArrayType a typedArray constructor
 * @return {number} the GL type for type. For example pass in `Int8Array` and `gl.BYTE` will
 *   be returned. Pass in `Uint32Array` and `gl.UNSIGNED_INT` will be returned
 * @memberOf module:twgl/typedArray
 */
function getGLTypeForTypedArrayType(typedArrayType) {
  if (typedArrayType === Int8Array)         { return BYTE; }           // eslint-disable-line
  if (typedArrayType === Uint8Array)        { return UNSIGNED_BYTE; }  // eslint-disable-line
  if (typedArrayType === Uint8ClampedArray) { return UNSIGNED_BYTE; }  // eslint-disable-line
  if (typedArrayType === Int16Array)        { return SHORT; }          // eslint-disable-line
  if (typedArrayType === Uint16Array)       { return UNSIGNED_SHORT; } // eslint-disable-line
  if (typedArrayType === Int32Array)        { return INT; }            // eslint-disable-line
  if (typedArrayType === Uint32Array)       { return UNSIGNED_INT; }   // eslint-disable-line
  if (typedArrayType === Float32Array)      { return FLOAT; }          // eslint-disable-line
  throw new Error('unsupported typed array type');
}

const isArrayBuffer = typeof SharedArrayBuffer !== 'undefined'
  ? function isArrayBufferOrSharedArrayBuffer(a) {
    return a && a.buffer && (a.buffer instanceof ArrayBuffer || a.buffer instanceof SharedArrayBuffer);
  }
  : function isArrayBuffer(a) {
    return a && a.buffer && a.buffer instanceof ArrayBuffer;
  };

function isBuffer(gl, t) {
  return typeof WebGLBuffer !== 'undefined' && t instanceof WebGLBuffer;
}

function isTexture(gl, t) {
  return typeof WebGLTexture !== 'undefined' && t instanceof WebGLTexture;
}

/*
 * Copyright 2019 Gregg Tavares
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

const STATIC_DRAW                  = 0x88e4;
const ARRAY_BUFFER                 = 0x8892;
const ELEMENT_ARRAY_BUFFER         = 0x8893;
const BUFFER_SIZE                  = 0x8764;

const BYTE$1                         = 0x1400;
const UNSIGNED_BYTE$1                = 0x1401;
const SHORT$1                        = 0x1402;
const UNSIGNED_SHORT$1               = 0x1403;
const INT$1                          = 0x1404;
const UNSIGNED_INT$1                 = 0x1405;
const FLOAT$1                        = 0x1406;
const defaults = {
  attribPrefix: "",
};

function setBufferFromTypedArray(gl, type, buffer, array, drawType) {
  gl.bindBuffer(type, buffer);
  gl.bufferData(type, array, drawType || STATIC_DRAW);
}

/**
 * Given typed array creates a WebGLBuffer and copies the typed array
 * into it.
 *
 * @param {WebGLRenderingContext} gl A WebGLRenderingContext
 * @param {ArrayBuffer|SharedArrayBuffer|ArrayBufferView|WebGLBuffer} typedArray the typed array. Note: If a WebGLBuffer is passed in it will just be returned. No action will be taken
 * @param {number} [type] the GL bind type for the buffer. Default = `gl.ARRAY_BUFFER`.
 * @param {number} [drawType] the GL draw type for the buffer. Default = 'gl.STATIC_DRAW`.
 * @return {WebGLBuffer} the created WebGLBuffer
 * @memberOf module:twgl/attributes
 */
function createBufferFromTypedArray(gl, typedArray, type, drawType) {
  if (isBuffer(gl, typedArray)) {
    return typedArray;
  }
  type = type || ARRAY_BUFFER;
  const buffer = gl.createBuffer();
  setBufferFromTypedArray(gl, type, buffer, typedArray, drawType);
  return buffer;
}

function isIndices(name) {
  return name === "indices";
}

// This is really just a guess. Though I can't really imagine using
// anything else? Maybe for some compression?
function getNormalizationForTypedArray(typedArray) {
  if (typedArray instanceof Int8Array)    { return true; }  // eslint-disable-line
  if (typedArray instanceof Uint8Array)   { return true; }  // eslint-disable-line
  return false;
}

// This is really just a guess. Though I can't really imagine using
// anything else? Maybe for some compression?
function getNormalizationForTypedArrayType(typedArrayType) {
  if (typedArrayType === Int8Array)    { return true; }  // eslint-disable-line
  if (typedArrayType === Uint8Array)   { return true; }  // eslint-disable-line
  return false;
}

function getArray(array) {
  return array.length ? array : array.data;
}

const texcoordRE = /coord|texture/i;
const colorRE = /color|colour/i;

function guessNumComponentsFromName(name, length) {
  let numComponents;
  if (texcoordRE.test(name)) {
    numComponents = 2;
  } else if (colorRE.test(name)) {
    numComponents = 4;
  } else {
    numComponents = 3;  // position, normals, indices ...
  }

  if (length % numComponents > 0) {
    throw new Error(`Can not guess numComponents for attribute '${name}'. Tried ${numComponents} but ${length} values is not evenly divisible by ${numComponents}. You should specify it.`);
  }

  return numComponents;
}

function getNumComponents(array, arrayName) {
  return array.numComponents || array.size || guessNumComponentsFromName(arrayName, getArray(array).length);
}

function makeTypedArray(array, name) {
  if (isArrayBuffer(array)) {
    return array;
  }

  if (isArrayBuffer(array.data)) {
    return array.data;
  }

  if (Array.isArray(array)) {
    array = {
      data: array,
    };
  }

  let Type = array.type;
  if (!Type) {
    if (isIndices(name)) {
      Type = Uint16Array;
    } else {
      Type = Float32Array;
    }
  }
  return new Type(array.data);
}

/**
 * The info for an attribute. This is effectively just the arguments to `gl.vertexAttribPointer` plus the WebGLBuffer
 * for the attribute.
 *
 * @typedef {Object} AttribInfo
 * @property {number[]|ArrayBufferView} [value] a constant value for the attribute. Note: if this is set the attribute will be
 *    disabled and set to this constant value and all other values will be ignored.
 * @property {number} [numComponents] the number of components for this attribute.
 * @property {number} [size] synonym for `numComponents`.
 * @property {number} [type] the type of the attribute (eg. `gl.FLOAT`, `gl.UNSIGNED_BYTE`, etc...) Default = `gl.FLOAT`
 * @property {boolean} [normalize] whether or not to normalize the data. Default = false
 * @property {number} [offset] offset into buffer in bytes. Default = 0
 * @property {number} [stride] the stride in bytes per element. Default = 0
 * @property {number} [divisor] the divisor in instances. Default = undefined. Note: undefined = don't call gl.vertexAttribDivisor
 *    where as anything else = do call it with this value
 * @property {WebGLBuffer} buffer the buffer that contains the data for this attribute
 * @property {number} [drawType] the draw type passed to gl.bufferData. Default = gl.STATIC_DRAW
 * @memberOf module:twgl
 */

/**
 * Use this type of array spec when TWGL can't guess the type or number of components of an array
 * @typedef {Object} FullArraySpec
 * @property {number[]|ArrayBufferView} [value] a constant value for the attribute. Note: if this is set the attribute will be
 *    disabled and set to this constant value and all other values will be ignored.
 * @property {(number|number[]|ArrayBufferView)} data The data of the array. A number alone becomes the number of elements of type.
 * @property {number} [numComponents] number of components for `vertexAttribPointer`. Default is based on the name of the array.
 *    If `coord` is in the name assumes `numComponents = 2`.
 *    If `color` is in the name assumes `numComponents = 4`.
 *    otherwise assumes `numComponents = 3`
 * @property {constructor} [type] type. This is only used if `data` is a JavaScript array. It is the constructor for the typedarray. (eg. `Uint8Array`).
 * For example if you want colors in a `Uint8Array` you might have a `FullArraySpec` like `{ type: Uint8Array, data: [255,0,255,255, ...], }`.
 * @property {number} [size] synonym for `numComponents`.
 * @property {boolean} [normalize] normalize for `vertexAttribPointer`. Default is true if type is `Int8Array` or `Uint8Array` otherwise false.
 * @property {number} [stride] stride for `vertexAttribPointer`. Default = 0
 * @property {number} [offset] offset for `vertexAttribPointer`. Default = 0
 * @property {number} [divisor] divisor for `vertexAttribDivisor`. Default = undefined. Note: undefined = don't call gl.vertexAttribDivisor
 *    where as anything else = do call it with this value
 * @property {string} [attrib] name of attribute this array maps to. Defaults to same name as array prefixed by the default attribPrefix.
 * @property {string} [name] synonym for `attrib`.
 * @property {string} [attribName] synonym for `attrib`.
 * @property {WebGLBuffer} [buffer] Buffer to use for this attribute. This lets you use your own buffer
 *    but you will need to supply `numComponents` and `type`. You can effectively pass an `AttribInfo`
 *    to provide this. Example:
 *
 *         const bufferInfo1 = twgl.createBufferInfoFromArrays(gl, {
 *           position: [1, 2, 3, ... ],
 *         });
 *         const bufferInfo2 = twgl.createBufferInfoFromArrays(gl, {
 *           position: bufferInfo1.attribs.position,  // use the same buffer from bufferInfo1
 *         });
 *
 * @memberOf module:twgl
 */

/**
 * An individual array in {@link module:twgl.Arrays}
 *
 * When passed to {@link module:twgl.createBufferInfoFromArrays} if an ArraySpec is `number[]` or `ArrayBufferView`
 * the types will be guessed based on the name. `indices` will be `Uint16Array`, everything else will
 * be `Float32Array`. If an ArraySpec is a number it's the number of floats for an empty (zeroed) buffer.
 *
 * @typedef {(number|number[]|ArrayBufferView|module:twgl.FullArraySpec)} ArraySpec
 * @memberOf module:twgl
 */

/**
 * This is a JavaScript object of arrays by name. The names should match your shader's attributes. If your
 * attributes have a common prefix you can specify it by calling {@link module:twgl.setAttributePrefix}.
 *
 *     Bare JavaScript Arrays
 *
 *         var arrays = {
 *            position: [-1, 1, 0],
 *            normal: [0, 1, 0],
 *            ...
 *         }
 *
 *     Bare TypedArrays
 *
 *         var arrays = {
 *            position: new Float32Array([-1, 1, 0]),
 *            color: new Uint8Array([255, 128, 64, 255]),
 *            ...
 *         }
 *
 * *   Will guess at `numComponents` if not specified based on name.
 *
 *     If `coord` is in the name assumes `numComponents = 2`
 *
 *     If `color` is in the name assumes `numComponents = 4`
 *
 *     otherwise assumes `numComponents = 3`
 *
 * Objects with various fields. See {@link module:twgl.FullArraySpec}.
 *
 *     var arrays = {
 *       position: { numComponents: 3, data: [0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0], },
 *       texcoord: { numComponents: 2, data: [0, 0, 0, 1, 1, 0, 1, 1],                 },
 *       normal:   { numComponents: 3, data: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],     },
 *       indices:  { numComponents: 3, data: [0, 1, 2, 1, 2, 3],                       },
 *     };
 *
 * @typedef {Object.<string, module:twgl.ArraySpec>} Arrays
 * @memberOf module:twgl
 */


/**
 * Creates a set of attribute data and WebGLBuffers from set of arrays
 *
 * Given
 *
 *      var arrays = {
 *        position: { numComponents: 3, data: [0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0], },
 *        texcoord: { numComponents: 2, data: [0, 0, 0, 1, 1, 0, 1, 1],                 },
 *        normal:   { numComponents: 3, data: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],     },
 *        color:    { numComponents: 4, data: [255, 255, 255, 255, 255, 0, 0, 255, 0, 0, 255, 255], type: Uint8Array, },
 *        indices:  { numComponents: 3, data: [0, 1, 2, 1, 2, 3],                       },
 *      };
 *
 * returns something like
 *
 *      var attribs = {
 *        position: { numComponents: 3, type: gl.FLOAT,         normalize: false, buffer: WebGLBuffer, },
 *        texcoord: { numComponents: 2, type: gl.FLOAT,         normalize: false, buffer: WebGLBuffer, },
 *        normal:   { numComponents: 3, type: gl.FLOAT,         normalize: false, buffer: WebGLBuffer, },
 *        color:    { numComponents: 4, type: gl.UNSIGNED_BYTE, normalize: true,  buffer: WebGLBuffer, },
 *      };
 *
 * notes:
 *
 * *   Arrays can take various forms
 *
 *     Bare JavaScript Arrays
 *
 *         var arrays = {
 *            position: [-1, 1, 0],
 *            normal: [0, 1, 0],
 *            ...
 *         }
 *
 *     Bare TypedArrays
 *
 *         var arrays = {
 *            position: new Float32Array([-1, 1, 0]),
 *            color: new Uint8Array([255, 128, 64, 255]),
 *            ...
 *         }
 *
 * *   Will guess at `numComponents` if not specified based on name.
 *
 *     If `coord` is in the name assumes `numComponents = 2`
 *
 *     If `color` is in the name assumes `numComponents = 4`
 *
 *     otherwise assumes `numComponents = 3`
 *
 * @param {WebGLRenderingContext} gl The webgl rendering context.
 * @param {module:twgl.Arrays} arrays The arrays
 * @param {module:twgl.BufferInfo} [srcBufferInfo] a BufferInfo to copy from
 *   This lets you share buffers. Any arrays you supply will override
 *   the buffers from srcBufferInfo.
 * @return {Object.<string, module:twgl.AttribInfo>} the attribs
 * @memberOf module:twgl/attributes
 */
function createAttribsFromArrays(gl, arrays) {
  const attribs = {};
  Object.keys(arrays).forEach(function(arrayName) {
    if (!isIndices(arrayName)) {
      const array = arrays[arrayName];
      const attribName = array.attrib || array.name || array.attribName || (defaults.attribPrefix + arrayName);
      if (array.value) {
        if (!Array.isArray(array.value) && !isArrayBuffer(array.value)) {
          throw new Error('array.value is not array or typedarray');
        }
        attribs[attribName] = {
          value: array.value,
        };
      } else {
        let buffer;
        let type;
        let normalization;
        let numComponents;
        if (array.buffer && array.buffer instanceof WebGLBuffer) {
          buffer = array.buffer;
          numComponents = array.numComponents || array.size;
          type = array.type;
          normalization = array.normalize;
        } else if (typeof array === "number" || typeof array.data === "number") {
          const numValues = array.data || array;
          const arrayType = array.type || Float32Array;
          const numBytes = numValues * arrayType.BYTES_PER_ELEMENT;
          type = getGLTypeForTypedArrayType(arrayType);
          normalization = array.normalize !== undefined ? array.normalize : getNormalizationForTypedArrayType(arrayType);
          numComponents = array.numComponents || array.size || guessNumComponentsFromName(arrayName, numValues);
          buffer = gl.createBuffer();
          gl.bindBuffer(ARRAY_BUFFER, buffer);
          gl.bufferData(ARRAY_BUFFER, numBytes, array.drawType || STATIC_DRAW);
        } else {
          const typedArray = makeTypedArray(array, arrayName);
          buffer = createBufferFromTypedArray(gl, typedArray, undefined, array.drawType);
          type = getGLTypeForTypedArray(typedArray);
          normalization = array.normalize !== undefined ? array.normalize : getNormalizationForTypedArray(typedArray);
          numComponents = getNumComponents(array, arrayName);
        }
        attribs[attribName] = {
          buffer:        buffer,
          numComponents: numComponents,
          type:          type,
          normalize:     normalization,
          stride:        array.stride || 0,
          offset:        array.offset || 0,
          divisor:       array.divisor === undefined ? undefined : array.divisor,
          drawType:      array.drawType,
        };
      }
    }
  });
  gl.bindBuffer(ARRAY_BUFFER, null);
  return attribs;
}

function getBytesPerValueForGLType(gl, type) {
  if (type === BYTE$1)           return 1;  // eslint-disable-line
  if (type === UNSIGNED_BYTE$1)  return 1;  // eslint-disable-line
  if (type === SHORT$1)          return 2;  // eslint-disable-line
  if (type === UNSIGNED_SHORT$1) return 2;  // eslint-disable-line
  if (type === INT$1)            return 4;  // eslint-disable-line
  if (type === UNSIGNED_INT$1)   return 4;  // eslint-disable-line
  if (type === FLOAT$1)          return 4;  // eslint-disable-line
  return 0;
}

// Tries to get the number of elements from a set of arrays.
const positionKeys = ['position', 'positions', 'a_position'];

function getNumElementsFromAttributes(gl, attribs) {
  let key;
  let ii;
  for (ii = 0; ii < positionKeys.length; ++ii) {
    key = positionKeys[ii];
    if (key in attribs) {
      break;
    }
    key = defaults.attribPrefix + key;
    if (key in attribs) {
      break;
    }
  }
  if (ii === positionKeys.length) {
    key = Object.keys(attribs)[0];
  }
  const attrib = attribs[key];
  gl.bindBuffer(ARRAY_BUFFER, attrib.buffer);
  const numBytes = gl.getBufferParameter(ARRAY_BUFFER, BUFFER_SIZE);
  gl.bindBuffer(ARRAY_BUFFER, null);

  const bytesPerValue = getBytesPerValueForGLType(gl, attrib.type);
  const totalElements = numBytes / bytesPerValue;
  const numComponents = attrib.numComponents || attrib.size;
  // TODO: check stride
  const numElements = totalElements / numComponents;
  if (numElements % 1 !== 0) {
    throw new Error(`numComponents ${numComponents} not correct for length ${length}`);
  }
  return numElements;
}

/**
 * @typedef {Object} BufferInfo
 * @property {number} numElements The number of elements to pass to `gl.drawArrays` or `gl.drawElements`.
 * @property {number} [elementType] The type of indices `UNSIGNED_BYTE`, `UNSIGNED_SHORT` etc..
 * @property {WebGLBuffer} [indices] The indices `ELEMENT_ARRAY_BUFFER` if any indices exist.
 * @property {Object.<string, module:twgl.AttribInfo>} [attribs] The attribs appropriate to call `setAttributes`
 * @memberOf module:twgl
 */

/**
 * Creates a BufferInfo from an object of arrays.
 *
 * This can be passed to {@link module:twgl.setBuffersAndAttributes} and to
 * {@link module:twgl:drawBufferInfo}.
 *
 * Given an object like
 *
 *     var arrays = {
 *       position: { numComponents: 3, data: [0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0], },
 *       texcoord: { numComponents: 2, data: [0, 0, 0, 1, 1, 0, 1, 1],                 },
 *       normal:   { numComponents: 3, data: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],     },
 *       indices:  { numComponents: 3, data: [0, 1, 2, 1, 2, 3],                       },
 *     };
 *
 *  Creates an BufferInfo like this
 *
 *     bufferInfo = {
 *       numElements: 4,        // or whatever the number of elements is
 *       indices: WebGLBuffer,  // this property will not exist if there are no indices
 *       attribs: {
 *         position: { buffer: WebGLBuffer, numComponents: 3, },
 *         normal:   { buffer: WebGLBuffer, numComponents: 3, },
 *         texcoord: { buffer: WebGLBuffer, numComponents: 2, },
 *       },
 *     };
 *
 *  The properties of arrays can be JavaScript arrays in which case the number of components
 *  will be guessed.
 *
 *     var arrays = {
 *        position: [0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0],
 *        texcoord: [0, 0, 0, 1, 1, 0, 1, 1],
 *        normal:   [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
 *        indices:  [0, 1, 2, 1, 2, 3],
 *     };
 *
 *  They can also be TypedArrays
 *
 *     var arrays = {
 *        position: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0]),
 *        texcoord: new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]),
 *        normal:   new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
 *        indices:  new Uint16Array([0, 1, 2, 1, 2, 3]),
 *     };
 *
 *  Or AugmentedTypedArrays
 *
 *     var positions = createAugmentedTypedArray(3, 4);
 *     var texcoords = createAugmentedTypedArray(2, 4);
 *     var normals   = createAugmentedTypedArray(3, 4);
 *     var indices   = createAugmentedTypedArray(3, 2, Uint16Array);
 *
 *     positions.push([0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0]);
 *     texcoords.push([0, 0, 0, 1, 1, 0, 1, 1]);
 *     normals.push([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
 *     indices.push([0, 1, 2, 1, 2, 3]);
 *
 *     var arrays = {
 *        position: positions,
 *        texcoord: texcoords,
 *        normal:   normals,
 *        indices:  indices,
 *     };
 *
 * For the last example it is equivalent to
 *
 *     var bufferInfo = {
 *       attribs: {
 *         position: { numComponents: 3, buffer: gl.createBuffer(), },
 *         texcoord: { numComponents: 2, buffer: gl.createBuffer(), },
 *         normal: { numComponents: 3, buffer: gl.createBuffer(), },
 *       },
 *       indices: gl.createBuffer(),
 *       numElements: 6,
 *     };
 *
 *     gl.bindBuffer(gl.ARRAY_BUFFER, bufferInfo.attribs.position.buffer);
 *     gl.bufferData(gl.ARRAY_BUFFER, arrays.position, gl.STATIC_DRAW);
 *     gl.bindBuffer(gl.ARRAY_BUFFER, bufferInfo.attribs.texcoord.buffer);
 *     gl.bufferData(gl.ARRAY_BUFFER, arrays.texcoord, gl.STATIC_DRAW);
 *     gl.bindBuffer(gl.ARRAY_BUFFER, bufferInfo.attribs.normal.buffer);
 *     gl.bufferData(gl.ARRAY_BUFFER, arrays.normal, gl.STATIC_DRAW);
 *     gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufferInfo.indices);
 *     gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arrays.indices, gl.STATIC_DRAW);
 *
 * @param {WebGLRenderingContext} gl A WebGLRenderingContext
 * @param {module:twgl.Arrays} arrays Your data
 * @param {module:twgl.BufferInfo} [srcBufferInfo] An existing
 *        buffer info to start from. WebGLBuffers etc specified
 *        in the srcBufferInfo will be used in a new BufferInfo
 *        with any arrays specified overriding the ones in
 *        srcBufferInfo.
 * @return {module:twgl.BufferInfo} A BufferInfo
 * @memberOf module:twgl/attributes
 */
function createBufferInfoFromArrays(gl, arrays, srcBufferInfo) {
  const newAttribs = createAttribsFromArrays(gl, arrays);
  const bufferInfo = Object.assign({}, srcBufferInfo ? srcBufferInfo : {});
  bufferInfo.attribs = Object.assign({}, srcBufferInfo ? srcBufferInfo.attribs : {}, newAttribs);
  const indices = arrays.indices;
  if (indices) {
    const newIndices = makeTypedArray(indices, "indices");
    bufferInfo.indices = createBufferFromTypedArray(gl, newIndices, ELEMENT_ARRAY_BUFFER);
    bufferInfo.numElements = newIndices.length;
    bufferInfo.elementType = getGLTypeForTypedArray(newIndices);
  } else if (!bufferInfo.numElements) {
    bufferInfo.numElements = getNumElementsFromAttributes(gl, bufferInfo.attribs);
  }

  return bufferInfo;
}

/*
 * Copyright 2019 Gregg Tavares
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

/**
 * Gets the gl version as a number
 * @param {WebGLRenderingContext} gl A WebGLRenderingContext
 * @return {number} version of gl
 * @private
 */
//function getVersionAsNumber(gl) {
//  return parseFloat(gl.getParameter(gl.VERSION).substr(6));
//}

/**
 * Check if context is WebGL 2.0
 * @param {WebGLRenderingContext} gl A WebGLRenderingContext
 * @return {bool} true if it's WebGL 2.0
 * @memberOf module:twgl
 */
function isWebGL2(gl) {
  // This is the correct check but it's slow
  //  return gl.getParameter(gl.VERSION).indexOf("WebGL 2.0") === 0;
  // This might also be the correct check but I'm assuming it's slow-ish
  // return gl instanceof WebGL2RenderingContext;
  return !!gl.texStorage2D;
}

const TEXTURE0                       = 0x84c0;

const ARRAY_BUFFER$1                   = 0x8892;

const ACTIVE_UNIFORMS                = 0x8b86;
const ACTIVE_ATTRIBUTES              = 0x8b89;
const TRANSFORM_FEEDBACK_VARYINGS    = 0x8c83;
const ACTIVE_UNIFORM_BLOCKS          = 0x8a36;
const UNIFORM_BLOCK_REFERENCED_BY_VERTEX_SHADER   = 0x8a44;
const UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER = 0x8a46;
const UNIFORM_BLOCK_DATA_SIZE                     = 0x8a40;
const UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES        = 0x8a43;

const FLOAT$3                         = 0x1406;
const FLOAT_VEC2                    = 0x8B50;
const FLOAT_VEC3                    = 0x8B51;
const FLOAT_VEC4                    = 0x8B52;
const INT$3                           = 0x1404;
const INT_VEC2                      = 0x8B53;
const INT_VEC3                      = 0x8B54;
const INT_VEC4                      = 0x8B55;
const BOOL                          = 0x8B56;
const BOOL_VEC2                     = 0x8B57;
const BOOL_VEC3                     = 0x8B58;
const BOOL_VEC4                     = 0x8B59;
const FLOAT_MAT2                    = 0x8B5A;
const FLOAT_MAT3                    = 0x8B5B;
const FLOAT_MAT4                    = 0x8B5C;
const SAMPLER_2D                    = 0x8B5E;
const SAMPLER_CUBE                  = 0x8B60;
const SAMPLER_3D                    = 0x8B5F;
const SAMPLER_2D_SHADOW             = 0x8B62;
const FLOAT_MAT2x3                  = 0x8B65;
const FLOAT_MAT2x4                  = 0x8B66;
const FLOAT_MAT3x2                  = 0x8B67;
const FLOAT_MAT3x4                  = 0x8B68;
const FLOAT_MAT4x2                  = 0x8B69;
const FLOAT_MAT4x3                  = 0x8B6A;
const SAMPLER_2D_ARRAY              = 0x8DC1;
const SAMPLER_2D_ARRAY_SHADOW       = 0x8DC4;
const SAMPLER_CUBE_SHADOW           = 0x8DC5;
const UNSIGNED_INT$3                  = 0x1405;
const UNSIGNED_INT_VEC2             = 0x8DC6;
const UNSIGNED_INT_VEC3             = 0x8DC7;
const UNSIGNED_INT_VEC4             = 0x8DC8;
const INT_SAMPLER_2D                = 0x8DCA;
const INT_SAMPLER_3D                = 0x8DCB;
const INT_SAMPLER_CUBE              = 0x8DCC;
const INT_SAMPLER_2D_ARRAY          = 0x8DCF;
const UNSIGNED_INT_SAMPLER_2D       = 0x8DD2;
const UNSIGNED_INT_SAMPLER_3D       = 0x8DD3;
const UNSIGNED_INT_SAMPLER_CUBE     = 0x8DD4;
const UNSIGNED_INT_SAMPLER_2D_ARRAY = 0x8DD7;

const TEXTURE_2D$1                    = 0x0DE1;
const TEXTURE_CUBE_MAP$1              = 0x8513;
const TEXTURE_3D$1                    = 0x806F;
const TEXTURE_2D_ARRAY$1              = 0x8C1A;

const typeMap = {};

/**
 * Returns the corresponding bind point for a given sampler type
 */
function getBindPointForSamplerType(gl, type) {
  return typeMap[type].bindPoint;
}

// This kind of sucks! If you could compose functions as in `var fn = gl[name];`
// this code could be a lot smaller but that is sadly really slow (T_T)

function floatSetter(gl, location) {
  return function(v) {
    gl.uniform1f(location, v);
  };
}

function floatArraySetter(gl, location) {
  return function(v) {
    gl.uniform1fv(location, v);
  };
}

function floatVec2Setter(gl, location) {
  return function(v) {
    gl.uniform2fv(location, v);
  };
}

function floatVec3Setter(gl, location) {
  return function(v) {
    gl.uniform3fv(location, v);
  };
}

function floatVec4Setter(gl, location) {
  return function(v) {
    gl.uniform4fv(location, v);
  };
}

function intSetter(gl, location) {
  return function(v) {
    gl.uniform1i(location, v);
  };
}

function intArraySetter(gl, location) {
  return function(v) {
    gl.uniform1iv(location, v);
  };
}

function intVec2Setter(gl, location) {
  return function(v) {
    gl.uniform2iv(location, v);
  };
}

function intVec3Setter(gl, location) {
  return function(v) {
    gl.uniform3iv(location, v);
  };
}

function intVec4Setter(gl, location) {
  return function(v) {
    gl.uniform4iv(location, v);
  };
}

function uintSetter(gl, location) {
  return function(v) {
    gl.uniform1ui(location, v);
  };
}

function uintArraySetter(gl, location) {
  return function(v) {
    gl.uniform1uiv(location, v);
  };
}

function uintVec2Setter(gl, location) {
  return function(v) {
    gl.uniform2uiv(location, v);
  };
}

function uintVec3Setter(gl, location) {
  return function(v) {
    gl.uniform3uiv(location, v);
  };
}

function uintVec4Setter(gl, location) {
  return function(v) {
    gl.uniform4uiv(location, v);
  };
}

function floatMat2Setter(gl, location) {
  return function(v) {
    gl.uniformMatrix2fv(location, false, v);
  };
}

function floatMat3Setter(gl, location) {
  return function(v) {
    gl.uniformMatrix3fv(location, false, v);
  };
}

function floatMat4Setter(gl, location) {
  return function(v) {
    gl.uniformMatrix4fv(location, false, v);
  };
}

function floatMat23Setter(gl, location) {
  return function(v) {
    gl.uniformMatrix2x3fv(location, false, v);
  };
}

function floatMat32Setter(gl, location) {
  return function(v) {
    gl.uniformMatrix3x2fv(location, false, v);
  };
}

function floatMat24Setter(gl, location) {
  return function(v) {
    gl.uniformMatrix2x4fv(location, false, v);
  };
}

function floatMat42Setter(gl, location) {
  return function(v) {
    gl.uniformMatrix4x2fv(location, false, v);
  };
}

function floatMat34Setter(gl, location) {
  return function(v) {
    gl.uniformMatrix3x4fv(location, false, v);
  };
}

function floatMat43Setter(gl, location) {
  return function(v) {
    gl.uniformMatrix4x3fv(location, false, v);
  };
}

function samplerSetter(gl, type, unit, location) {
  const bindPoint = getBindPointForSamplerType(gl, type);
  return isWebGL2(gl) ? function(textureOrPair) {
    let texture;
    let sampler;
    if (isTexture(gl, textureOrPair)) {
      texture = textureOrPair;
      sampler = null;
    } else {
      texture = textureOrPair.texture;
      sampler = textureOrPair.sampler;
    }
    gl.uniform1i(location, unit);
    gl.activeTexture(TEXTURE0 + unit);
    gl.bindTexture(bindPoint, texture);
    gl.bindSampler(unit, sampler);
  } : function(texture) {
    gl.uniform1i(location, unit);
    gl.activeTexture(TEXTURE0 + unit);
    gl.bindTexture(bindPoint, texture);
  };
}

function samplerArraySetter(gl, type, unit, location, size) {
  const bindPoint = getBindPointForSamplerType(gl, type);
  const units = new Int32Array(size);
  for (let ii = 0; ii < size; ++ii) {
    units[ii] = unit + ii;
  }

  return isWebGL2(gl) ? function(textures) {
    gl.uniform1iv(location, units);
    textures.forEach(function(textureOrPair, index) {
      gl.activeTexture(TEXTURE0 + units[index]);
      let texture;
      let sampler;
      if (isTexture(gl, textureOrPair)) {
        texture = textureOrPair;
        sampler = null;
      } else {
        texture = textureOrPair.texture;
        sampler = textureOrPair.sampler;
      }
      gl.bindSampler(unit, sampler);
      gl.bindTexture(bindPoint, texture);
    });
  } : function(textures) {
    gl.uniform1iv(location, units);
    textures.forEach(function(texture, index) {
      gl.activeTexture(TEXTURE0 + units[index]);
      gl.bindTexture(bindPoint, texture);
    });
  };
}

typeMap[FLOAT$3]                         = { Type: Float32Array, size:  4, setter: floatSetter,      arraySetter: floatArraySetter, };
typeMap[FLOAT_VEC2]                    = { Type: Float32Array, size:  8, setter: floatVec2Setter,  cols: 2, };
typeMap[FLOAT_VEC3]                    = { Type: Float32Array, size: 12, setter: floatVec3Setter,  cols: 3, };
typeMap[FLOAT_VEC4]                    = { Type: Float32Array, size: 16, setter: floatVec4Setter,  cols: 4, };
typeMap[INT$3]                           = { Type: Int32Array,   size:  4, setter: intSetter,        arraySetter: intArraySetter, };
typeMap[INT_VEC2]                      = { Type: Int32Array,   size:  8, setter: intVec2Setter,    cols: 2, };
typeMap[INT_VEC3]                      = { Type: Int32Array,   size: 12, setter: intVec3Setter,    cols: 3, };
typeMap[INT_VEC4]                      = { Type: Int32Array,   size: 16, setter: intVec4Setter,    cols: 4, };
typeMap[UNSIGNED_INT$3]                  = { Type: Uint32Array,  size:  4, setter: uintSetter,       arraySetter: uintArraySetter, };
typeMap[UNSIGNED_INT_VEC2]             = { Type: Uint32Array,  size:  8, setter: uintVec2Setter,   cols: 2, };
typeMap[UNSIGNED_INT_VEC3]             = { Type: Uint32Array,  size: 12, setter: uintVec3Setter,   cols: 3, };
typeMap[UNSIGNED_INT_VEC4]             = { Type: Uint32Array,  size: 16, setter: uintVec4Setter,   cols: 4, };
typeMap[BOOL]                          = { Type: Uint32Array,  size:  4, setter: intSetter,        arraySetter: intArraySetter, };
typeMap[BOOL_VEC2]                     = { Type: Uint32Array,  size:  8, setter: intVec2Setter,    cols: 2, };
typeMap[BOOL_VEC3]                     = { Type: Uint32Array,  size: 12, setter: intVec3Setter,    cols: 3, };
typeMap[BOOL_VEC4]                     = { Type: Uint32Array,  size: 16, setter: intVec4Setter,    cols: 4, };
typeMap[FLOAT_MAT2]                    = { Type: Float32Array, size: 32, setter: floatMat2Setter,  rows: 2, cols: 2, };
typeMap[FLOAT_MAT3]                    = { Type: Float32Array, size: 48, setter: floatMat3Setter,  rows: 3, cols: 3, };
typeMap[FLOAT_MAT4]                    = { Type: Float32Array, size: 64, setter: floatMat4Setter,  rows: 4, cols: 4, };
typeMap[FLOAT_MAT2x3]                  = { Type: Float32Array, size: 32, setter: floatMat23Setter, rows: 2, cols: 3, };
typeMap[FLOAT_MAT2x4]                  = { Type: Float32Array, size: 32, setter: floatMat24Setter, rows: 2, cols: 4, };
typeMap[FLOAT_MAT3x2]                  = { Type: Float32Array, size: 48, setter: floatMat32Setter, rows: 3, cols: 2, };
typeMap[FLOAT_MAT3x4]                  = { Type: Float32Array, size: 48, setter: floatMat34Setter, rows: 3, cols: 4, };
typeMap[FLOAT_MAT4x2]                  = { Type: Float32Array, size: 64, setter: floatMat42Setter, rows: 4, cols: 2, };
typeMap[FLOAT_MAT4x3]                  = { Type: Float32Array, size: 64, setter: floatMat43Setter, rows: 4, cols: 3, };
typeMap[SAMPLER_2D]                    = { Type: null,         size:  0, setter: samplerSetter,    arraySetter: samplerArraySetter, bindPoint: TEXTURE_2D$1,       };
typeMap[SAMPLER_CUBE]                  = { Type: null,         size:  0, setter: samplerSetter,    arraySetter: samplerArraySetter, bindPoint: TEXTURE_CUBE_MAP$1, };
typeMap[SAMPLER_3D]                    = { Type: null,         size:  0, setter: samplerSetter,    arraySetter: samplerArraySetter, bindPoint: TEXTURE_3D$1,       };
typeMap[SAMPLER_2D_SHADOW]             = { Type: null,         size:  0, setter: samplerSetter,    arraySetter: samplerArraySetter, bindPoint: TEXTURE_2D$1,       };
typeMap[SAMPLER_2D_ARRAY]              = { Type: null,         size:  0, setter: samplerSetter,    arraySetter: samplerArraySetter, bindPoint: TEXTURE_2D_ARRAY$1, };
typeMap[SAMPLER_2D_ARRAY_SHADOW]       = { Type: null,         size:  0, setter: samplerSetter,    arraySetter: samplerArraySetter, bindPoint: TEXTURE_2D_ARRAY$1, };
typeMap[SAMPLER_CUBE_SHADOW]           = { Type: null,         size:  0, setter: samplerSetter,    arraySetter: samplerArraySetter, bindPoint: TEXTURE_CUBE_MAP$1, };
typeMap[INT_SAMPLER_2D]                = { Type: null,         size:  0, setter: samplerSetter,    arraySetter: samplerArraySetter, bindPoint: TEXTURE_2D$1,       };
typeMap[INT_SAMPLER_3D]                = { Type: null,         size:  0, setter: samplerSetter,    arraySetter: samplerArraySetter, bindPoint: TEXTURE_3D$1,       };
typeMap[INT_SAMPLER_CUBE]              = { Type: null,         size:  0, setter: samplerSetter,    arraySetter: samplerArraySetter, bindPoint: TEXTURE_CUBE_MAP$1, };
typeMap[INT_SAMPLER_2D_ARRAY]          = { Type: null,         size:  0, setter: samplerSetter,    arraySetter: samplerArraySetter, bindPoint: TEXTURE_2D_ARRAY$1, };
typeMap[UNSIGNED_INT_SAMPLER_2D]       = { Type: null,         size:  0, setter: samplerSetter,    arraySetter: samplerArraySetter, bindPoint: TEXTURE_2D$1,       };
typeMap[UNSIGNED_INT_SAMPLER_3D]       = { Type: null,         size:  0, setter: samplerSetter,    arraySetter: samplerArraySetter, bindPoint: TEXTURE_3D$1,       };
typeMap[UNSIGNED_INT_SAMPLER_CUBE]     = { Type: null,         size:  0, setter: samplerSetter,    arraySetter: samplerArraySetter, bindPoint: TEXTURE_CUBE_MAP$1, };
typeMap[UNSIGNED_INT_SAMPLER_2D_ARRAY] = { Type: null,         size:  0, setter: samplerSetter,    arraySetter: samplerArraySetter, bindPoint: TEXTURE_2D_ARRAY$1, };

function floatAttribSetter(gl, index) {
  return function(b) {
    if (b.value) {
      gl.disableVertexAttribArray(index);
      switch (b.value.length) {
        case 4:
          gl.vertexAttrib4fv(index, b.value);
          break;
        case 3:
          gl.vertexAttrib3fv(index, b.value);
          break;
        case 2:
          gl.vertexAttrib2fv(index, b.value);
          break;
        case 1:
          gl.vertexAttrib1fv(index, b.value);
          break;
        default:
          throw new Error('the length of a float constant value must be between 1 and 4!');
      }
    } else {
      gl.bindBuffer(ARRAY_BUFFER$1, b.buffer);
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(
          index, b.numComponents || b.size, b.type || FLOAT$3, b.normalize || false, b.stride || 0, b.offset || 0);
      if (b.divisor !== undefined) {
        gl.vertexAttribDivisor(index, b.divisor);
      }
    }
  };
}

function intAttribSetter(gl, index) {
  return function(b) {
    if (b.value) {
      gl.disableVertexAttribArray(index);
      if (b.value.length === 4) {
        gl.vertexAttrib4iv(index, b.value);
      } else {
        throw new Error('The length of an integer constant value must be 4!');
      }
    } else {
      gl.bindBuffer(ARRAY_BUFFER$1, b.buffer);
      gl.enableVertexAttribArray(index);
      gl.vertexAttribIPointer(
          index, b.numComponents || b.size, b.type || INT$3, b.stride || 0, b.offset || 0);
      if (b.divisor !== undefined) {
        gl.vertexAttribDivisor(index, b.divisor);
      }
    }
  };
}

function uintAttribSetter(gl, index) {
  return function(b) {
    if (b.value) {
      gl.disableVertexAttribArray(index);
      if (b.value.length === 4) {
        gl.vertexAttrib4uiv(index, b.value);
      } else {
        throw new Error('The length of an unsigned integer constant value must be 4!');
      }
    } else {
      gl.bindBuffer(ARRAY_BUFFER$1, b.buffer);
      gl.enableVertexAttribArray(index);
      gl.vertexAttribIPointer(
          index, b.numComponents || b.size, b.type || UNSIGNED_INT$3, b.stride || 0, b.offset || 0);
      if (b.divisor !== undefined) {
        gl.vertexAttribDivisor(index, b.divisor);
      }
    }
  };
}

function matAttribSetter(gl, index, typeInfo) {
  const defaultSize = typeInfo.size;
  const count = typeInfo.count;

  return function(b) {
    gl.bindBuffer(ARRAY_BUFFER$1, b.buffer);
    const numComponents = b.size || b.numComponents || defaultSize;
    const size = numComponents / count;
    const type = b.type || FLOAT$3;
    const typeInfo = typeMap[type];
    const stride = typeInfo.size * numComponents;
    const normalize = b.normalize || false;
    const offset = b.offset || 0;
    const rowOffset = stride / count;
    for (let i = 0; i < count; ++i) {
      gl.enableVertexAttribArray(index + i);
      gl.vertexAttribPointer(
          index + i, size, type, normalize, stride, offset + rowOffset * i);
      if (b.divisor !== undefined) {
        gl.vertexAttribDivisor(index + i, b.divisor);
      }
    }
  };
}



const attrTypeMap = {};
attrTypeMap[FLOAT$3]             = { size:  4, setter: floatAttribSetter, };
attrTypeMap[FLOAT_VEC2]        = { size:  8, setter: floatAttribSetter, };
attrTypeMap[FLOAT_VEC3]        = { size: 12, setter: floatAttribSetter, };
attrTypeMap[FLOAT_VEC4]        = { size: 16, setter: floatAttribSetter, };
attrTypeMap[INT$3]               = { size:  4, setter: intAttribSetter,   };
attrTypeMap[INT_VEC2]          = { size:  8, setter: intAttribSetter,   };
attrTypeMap[INT_VEC3]          = { size: 12, setter: intAttribSetter,   };
attrTypeMap[INT_VEC4]          = { size: 16, setter: intAttribSetter,   };
attrTypeMap[UNSIGNED_INT$3]      = { size:  4, setter: uintAttribSetter,  };
attrTypeMap[UNSIGNED_INT_VEC2] = { size:  8, setter: uintAttribSetter,  };
attrTypeMap[UNSIGNED_INT_VEC3] = { size: 12, setter: uintAttribSetter,  };
attrTypeMap[UNSIGNED_INT_VEC4] = { size: 16, setter: uintAttribSetter,  };
attrTypeMap[BOOL]              = { size:  4, setter: intAttribSetter,   };
attrTypeMap[BOOL_VEC2]         = { size:  8, setter: intAttribSetter,   };
attrTypeMap[BOOL_VEC3]         = { size: 12, setter: intAttribSetter,   };
attrTypeMap[BOOL_VEC4]         = { size: 16, setter: intAttribSetter,   };
attrTypeMap[FLOAT_MAT2]        = { size:  4, setter: matAttribSetter,   count: 2, };
attrTypeMap[FLOAT_MAT3]        = { size:  9, setter: matAttribSetter,   count: 3, };
attrTypeMap[FLOAT_MAT4]        = { size: 16, setter: matAttribSetter,   count: 4, };

/**
 * Returns true if attribute/uniform is a reserved/built in
 *
 * It makes no sense to me why GL returns these because it's
 * illegal to call `gl.getUniformLocation` and `gl.getAttribLocation`
 * with names that start with `gl_` (and `webgl_` in WebGL)
 *
 * I can only assume they are there because they might count
 * when computing the number of uniforms/attributes used when you want to
 * know if you are near the limit. That doesn't really make sense
 * to me but the fact that these get returned are in the spec.
 *
 * @param {WebGLActiveInfo} info As returned from `gl.getActiveUniform` or
 *    `gl.getActiveAttrib`.
 * @return {bool} true if it's reserved
 * @private
 */
function isBuiltIn(info) {
  const name = info.name;
  return name.startsWith("gl_") || name.startsWith("webgl_");
}

const tokenRE = /(\.|\[|]|\w+)/g;
const isDigit = s => s >= '0' && s <= '9';
function addSetterToUniformTree(fullPath, setter, node, uniformSetters) {
  const tokens = fullPath.split(tokenRE).filter(s => s !== '');
  let tokenNdx = 0;
  let path = '';

  for (;;) {
    const token = tokens[tokenNdx++];  // has to be name or number
    path += token;
    const isArrayIndex = isDigit(token[0]);
    const accessor = isArrayIndex
        ? parseInt(token)
        : token;
    if (isArrayIndex) {
      path += tokens[tokenNdx++];  // skip ']'
    }
    const isLastToken = tokenNdx === tokens.length;
    if (isLastToken) {
      node[accessor] = setter;
      break;
    } else {
      const token = tokens[tokenNdx++];  // has to be . or [
      const isArray = token === '[';
      const child = node[accessor] || (isArray ? [] : {});
      node[accessor] = child;
      node = child;
      uniformSetters[path] = uniformSetters[path] || function(node) {
        return function(value) {
          setUniformTree(node, value);
        };
      }(child);
      path += token;
    }
  }
}

/**
 * Creates setter functions for all uniforms of a shader
 * program.
 *
 * @see {@link module:twgl.setUniforms}
 *
 * @param {WebGLRenderingContext} gl The WebGLRenderingContext to use.
 * @param {WebGLProgram} program the program to create setters for.
 * @returns {Object.<string, function>} an object with a setter by name for each uniform
 * @memberOf module:twgl/programs
 */
function createUniformSetters(gl, program) {
  let textureUnit = 0;

  /**
   * Creates a setter for a uniform of the given program with it's
   * location embedded in the setter.
   * @param {WebGLProgram} program
   * @param {WebGLUniformInfo} uniformInfo
   * @returns {function} the created setter.
   */
  function createUniformSetter(program, uniformInfo, location) {
    const isArray = uniformInfo.name.endsWith("[0]");
    const type = uniformInfo.type;
    const typeInfo = typeMap[type];
    if (!typeInfo) {
      throw new Error(`unknown type: 0x${type.toString(16)}`); // we should never get here.
    }
    let setter;
    if (typeInfo.bindPoint) {
      // it's a sampler
      const unit = textureUnit;
      textureUnit += uniformInfo.size;
      if (isArray) {
        setter = typeInfo.arraySetter(gl, type, unit, location, uniformInfo.size);
      } else {
        setter = typeInfo.setter(gl, type, unit, location, uniformInfo.size);
      }
    } else {
      if (typeInfo.arraySetter && isArray) {
        setter = typeInfo.arraySetter(gl, location);
      } else {
        setter = typeInfo.setter(gl, location);
      }
    }
    setter.location = location;
    return setter;
  }

  const uniformSetters = {};
  const uniformTree = {};
  const numUniforms = gl.getProgramParameter(program, ACTIVE_UNIFORMS);

  for (let ii = 0; ii < numUniforms; ++ii) {
    const uniformInfo = gl.getActiveUniform(program, ii);
    if (isBuiltIn(uniformInfo)) {
      continue;
    }
    let name = uniformInfo.name;
    // remove the array suffix.
    if (name.endsWith("[0]")) {
      name = name.substr(0, name.length - 3);
    }
    const location = gl.getUniformLocation(program, uniformInfo.name);
    // the uniform will have no location if it's in a uniform block
    if (location) {
      const setter = createUniformSetter(program, uniformInfo, location);
      uniformSetters[name] = setter;
      addSetterToUniformTree(name, setter, uniformTree, uniformSetters);
    }
  }

  return uniformSetters;
}

/**
 * @typedef {Object} TransformFeedbackInfo
 * @property {number} index index of transform feedback
 * @property {number} type GL type
 * @property {number} size 1 - 4
 * @memberOf module:twgl
 */

/**
 * Create TransformFeedbackInfo for passing to bindTransformFeedbackInfo.
 * @param {WebGLRenderingContext} gl The WebGLRenderingContext to use.
 * @param {WebGLProgram} program an existing WebGLProgram.
 * @return {Object<string, module:twgl.TransformFeedbackInfo>}
 * @memberOf module:twgl
 */
function createTransformFeedbackInfo(gl, program) {
  const info = {};
  const numVaryings = gl.getProgramParameter(program, TRANSFORM_FEEDBACK_VARYINGS);
  for (let ii = 0; ii < numVaryings; ++ii) {
    const varying = gl.getTransformFeedbackVarying(program, ii);
    info[varying.name] = {
      index: ii,
      type: varying.type,
      size: varying.size,
    };
  }
  return info;
}

/**
 * @typedef {Object} UniformData
 * @property {string} name The name of the uniform
 * @property {number} type The WebGL type enum for this uniform
 * @property {number} size The number of elements for this uniform
 * @property {number} blockNdx The block index this uniform appears in
 * @property {number} offset The byte offset in the block for this uniform's value
 * @memberOf module:twgl
 */

/**
 * The specification for one UniformBlockObject
 *
 * @typedef {Object} BlockSpec
 * @property {number} index The index of the block.
 * @property {number} size The size in bytes needed for the block
 * @property {number[]} uniformIndices The indices of the uniforms used by the block. These indices
 *    correspond to entries in a UniformData array in the {@link module:twgl.UniformBlockSpec}.
 * @property {bool} usedByVertexShader Self explanatory
 * @property {bool} usedByFragmentShader Self explanatory
 * @property {bool} used Self explanatory
 * @memberOf module:twgl
 */

/**
 * A `UniformBlockSpec` represents the data needed to create and bind
 * UniformBlockObjects for a given program
 *
 * @typedef {Object} UniformBlockSpec
 * @property {Object.<string, module:twgl.BlockSpec>} blockSpecs The BlockSpec for each block by block name
 * @property {UniformData[]} uniformData An array of data for each uniform by uniform index.
 * @memberOf module:twgl
 */

/**
 * Creates a UniformBlockSpec for the given program.
 *
 * A UniformBlockSpec represents the data needed to create and bind
 * UniformBlockObjects
 *
 * @param {WebGL2RenderingContext} gl A WebGL2 Rendering Context
 * @param {WebGLProgram} program A WebGLProgram for a successfully linked program
 * @return {module:twgl.UniformBlockSpec} The created UniformBlockSpec
 * @memberOf module:twgl/programs
 */
function createUniformBlockSpecFromProgram(gl, program) {
  const numUniforms = gl.getProgramParameter(program, ACTIVE_UNIFORMS);
  const uniformData = [];
  const uniformIndices = [];

  for (let ii = 0; ii < numUniforms; ++ii) {
    uniformIndices.push(ii);
    uniformData.push({});
    const uniformInfo = gl.getActiveUniform(program, ii);
    uniformData[ii].name = uniformInfo.name;
  }

  [
    [ "UNIFORM_TYPE", "type" ],
    [ "UNIFORM_SIZE", "size" ],  // num elements
    [ "UNIFORM_BLOCK_INDEX", "blockNdx" ],
    [ "UNIFORM_OFFSET", "offset", ],
  ].forEach(function(pair) {
    const pname = pair[0];
    const key = pair[1];
    gl.getActiveUniforms(program, uniformIndices, gl[pname]).forEach(function(value, ndx) {
      uniformData[ndx][key] = value;
    });
  });

  const blockSpecs = {};

  const numUniformBlocks = gl.getProgramParameter(program, ACTIVE_UNIFORM_BLOCKS);
  for (let ii = 0; ii < numUniformBlocks; ++ii) {
    const name = gl.getActiveUniformBlockName(program, ii);
    const blockSpec = {
      index: gl.getUniformBlockIndex(program, name),
      usedByVertexShader: gl.getActiveUniformBlockParameter(program, ii, UNIFORM_BLOCK_REFERENCED_BY_VERTEX_SHADER),
      usedByFragmentShader: gl.getActiveUniformBlockParameter(program, ii, UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER),
      size: gl.getActiveUniformBlockParameter(program, ii, UNIFORM_BLOCK_DATA_SIZE),
      uniformIndices: gl.getActiveUniformBlockParameter(program, ii, UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES),
    };
    blockSpec.used = blockSpec.usedByVertexShader || blockSpec.usedByFragmentShader;
    blockSpecs[name] = blockSpec;
  }

  return {
    blockSpecs: blockSpecs,
    uniformData: uniformData,
  };
}

function setUniformTree(tree, values) {
  for (const name in values) {
    const prop = tree[name];
    if (typeof prop === 'function') {
      prop(values[name]);
    } else {
      setUniformTree(tree[name], values[name]);
    }
  }
}

/**
 * Set uniforms and binds related textures.
 *
 * example:
 *
 *     const programInfo = createProgramInfo(
 *         gl, ["some-vs", "some-fs"]);
 *
 *     const tex1 = gl.createTexture();
 *     const tex2 = gl.createTexture();
 *
 *     ... assume we setup the textures with data ...
 *
 *     const uniforms = {
 *       u_someSampler: tex1,
 *       u_someOtherSampler: tex2,
 *       u_someColor: [1,0,0,1],
 *       u_somePosition: [0,1,1],
 *       u_someMatrix: [
 *         1,0,0,0,
 *         0,1,0,0,
 *         0,0,1,0,
 *         0,0,0,0,
 *       ],
 *     };
 *
 *     gl.useProgram(program);
 *
 * This will automatically bind the textures AND set the
 * uniforms.
 *
 *     twgl.setUniforms(programInfo, uniforms);
 *
 * For the example above it is equivalent to
 *
 *     var texUnit = 0;
 *     gl.activeTexture(gl.TEXTURE0 + texUnit);
 *     gl.bindTexture(gl.TEXTURE_2D, tex1);
 *     gl.uniform1i(u_someSamplerLocation, texUnit++);
 *     gl.activeTexture(gl.TEXTURE0 + texUnit);
 *     gl.bindTexture(gl.TEXTURE_2D, tex2);
 *     gl.uniform1i(u_someSamplerLocation, texUnit++);
 *     gl.uniform4fv(u_someColorLocation, [1, 0, 0, 1]);
 *     gl.uniform3fv(u_somePositionLocation, [0, 1, 1]);
 *     gl.uniformMatrix4fv(u_someMatrix, false, [
 *         1,0,0,0,
 *         0,1,0,0,
 *         0,0,1,0,
 *         0,0,0,0,
 *       ]);
 *
 * Note it is perfectly reasonable to call `setUniforms` multiple times. For example
 *
 *     const uniforms = {
 *       u_someSampler: tex1,
 *       u_someOtherSampler: tex2,
 *     };
 *
 *     const moreUniforms {
 *       u_someColor: [1,0,0,1],
 *       u_somePosition: [0,1,1],
 *       u_someMatrix: [
 *         1,0,0,0,
 *         0,1,0,0,
 *         0,0,1,0,
 *         0,0,0,0,
 *       ],
 *     };
 *
 *     twgl.setUniforms(programInfo, uniforms);
 *     twgl.setUniforms(programInfo, moreUniforms);
 *
 * You can also add WebGLSamplers to uniform samplers as in
 *
 *     const uniforms = {
 *       u_someSampler: {
 *         texture: someWebGLTexture,
 *         sampler: someWebGLSampler,
 *       },
 *     };
 *
 * In which case both the sampler and texture will be bound to the
 * same unit.
 *
 * @param {(module:twgl.ProgramInfo|Object.<string, function>)} setters a `ProgramInfo` as returned from `createProgramInfo` or the setters returned from
 *        `createUniformSetters`.
 * @param {Object.<string, ?>} values an object with values for the
 *        uniforms.
 *   You can pass multiple objects by putting them in an array or by calling with more arguments.For example
 *
 *     const sharedUniforms = {
 *       u_fogNear: 10,
 *       u_projection: ...
 *       ...
 *     };
 *
 *     const localUniforms = {
 *       u_world: ...
 *       u_diffuseColor: ...
 *     };
 *
 *     twgl.setUniforms(programInfo, sharedUniforms, localUniforms);
 *
 *     // is the same as
 *
 *     twgl.setUniforms(programInfo, [sharedUniforms, localUniforms]);
 *
 *     // is the same as
 *
 *     twgl.setUniforms(programInfo, sharedUniforms);
 *     twgl.setUniforms(programInfo, localUniforms};
 *
 *   You can also fill out structure and array values either via
 *   shortcut. Example
 *
 *     // -- in shader --
 *     struct Light {
 *       float intensity;
 *       vec4 color;
 *     };
 *     uniform Light lights[2];
 *
 *     // in JavaScript
 *
 *     twgl.setUniforms(programInfo, {
 *       lights: [
 *         { intensity: 5.0, color: [1, 0, 0, 1] },
 *         { intensity: 2.0, color: [0, 0, 1, 1] },
 *       ],
 *     });
 *
 *   or the more traditional way
 *
 *     twgl.setUniforms(programInfo, {
 *       "lights[0].intensity": 5.0,
 *       "lights[0].color": [1, 0, 0, 1],
 *       "lights[1].intensity": 2.0,
 *       "lights[1].color": [0, 0, 1, 1],
 *     });
 *
 *   You can also specify partial paths
 *
 *     twgl.setUniforms(programInfo, {
 *       'lights[1]: { intensity: 5.0, color: [1, 0, 0, 1] },
 *     });
 *
 *   But you can not specify leaf array indices
 *
 * @memberOf module:twgl/programs
 */
function setUniforms(setters, ...args) {  // eslint-disable-line
  const actualSetters = setters.uniformSetters || setters;
  const numArgs = args.length;
  for (let aNdx = 0; aNdx < numArgs; ++aNdx) {
    const values = args[aNdx];
    if (Array.isArray(values)) {
      const numValues = values.length;
      for (let ii = 0; ii < numValues; ++ii) {
        setUniforms(actualSetters, values[ii]);
      }
    } else {
      for (const name in values) {
        const setter = actualSetters[name];
        if (setter) {
          setter(values[name]);
        }
      }
    }
  }
}

/**
 * Creates setter functions for all attributes of a shader
 * program. You can pass this to {@link module:twgl.setBuffersAndAttributes} to set all your buffers and attributes.
 *
 * @see {@link module:twgl.setAttributes} for example
 * @param {WebGLRenderingContext} gl The WebGLRenderingContext to use.
 * @param {WebGLProgram} program the program to create setters for.
 * @return {Object.<string, function>} an object with a setter for each attribute by name.
 * @memberOf module:twgl/programs
 */
function createAttributeSetters(gl, program) {
  const attribSetters = {
  };

  const numAttribs = gl.getProgramParameter(program, ACTIVE_ATTRIBUTES);
  for (let ii = 0; ii < numAttribs; ++ii) {
    const attribInfo = gl.getActiveAttrib(program, ii);
    if (isBuiltIn(attribInfo)) {
      continue;
    }
    const index = gl.getAttribLocation(program, attribInfo.name);
    const typeInfo = attrTypeMap[attribInfo.type];
    const setter = typeInfo.setter(gl, index, typeInfo);
    setter.location = index;
    attribSetters[attribInfo.name] = setter;
  }

  return attribSetters;
}

/**
 * Sets attributes and binds buffers (deprecated... use {@link module:twgl.setBuffersAndAttributes})
 *
 * Example:
 *
 *     const program = createProgramFromScripts(
 *         gl, ["some-vs", "some-fs");
 *
 *     const attribSetters = createAttributeSetters(program);
 *
 *     const positionBuffer = gl.createBuffer();
 *     const texcoordBuffer = gl.createBuffer();
 *
 *     const attribs = {
 *       a_position: {buffer: positionBuffer, numComponents: 3},
 *       a_texcoord: {buffer: texcoordBuffer, numComponents: 2},
 *     };
 *
 *     gl.useProgram(program);
 *
 * This will automatically bind the buffers AND set the
 * attributes.
 *
 *     setAttributes(attribSetters, attribs);
 *
 * Properties of attribs. For each attrib you can add
 * properties:
 *
 * *   type: the type of data in the buffer. Default = gl.FLOAT
 * *   normalize: whether or not to normalize the data. Default = false
 * *   stride: the stride. Default = 0
 * *   offset: offset into the buffer. Default = 0
 * *   divisor: the divisor for instances. Default = undefined
 *
 * For example if you had 3 value float positions, 2 value
 * float texcoord and 4 value uint8 colors you'd setup your
 * attribs like this
 *
 *     const attribs = {
 *       a_position: {buffer: positionBuffer, numComponents: 3},
 *       a_texcoord: {buffer: texcoordBuffer, numComponents: 2},
 *       a_color: {
 *         buffer: colorBuffer,
 *         numComponents: 4,
 *         type: gl.UNSIGNED_BYTE,
 *         normalize: true,
 *       },
 *     };
 *
 * @param {Object.<string, function>} setters Attribute setters as returned from createAttributeSetters
 * @param {Object.<string, module:twgl.AttribInfo>} buffers AttribInfos mapped by attribute name.
 * @memberOf module:twgl/programs
 * @deprecated use {@link module:twgl.setBuffersAndAttributes}
 */
function setAttributes(setters, buffers) {
  for (const name in buffers) {
    const setter = setters[name];
    if (setter) {
      setter(buffers[name]);
    }
  }
}

/**
 * @typedef {Object} ProgramInfo
 * @property {WebGLProgram} program A shader program
 * @property {Object<string, function>} uniformSetters object of setters as returned from createUniformSetters,
 * @property {Object<string, function>} attribSetters object of setters as returned from createAttribSetters,
 * @property {module:twgl.UniformBlockSpec} [uniformBlockSpec] a uniform block spec for making UniformBlockInfos with createUniformBlockInfo etc..
 * @property {Object<string, module:twgl.TransformFeedbackInfo>} [transformFeedbackInfo] info for transform feedbacks
 * @memberOf module:twgl
 */

/**
 * Creates a ProgramInfo from an existing program.
 *
 * A ProgramInfo contains
 *
 *     programInfo = {
 *        program: WebGLProgram,
 *        uniformSetters: object of setters as returned from createUniformSetters,
 *        attribSetters: object of setters as returned from createAttribSetters,
 *     }
 *
 * @param {WebGLRenderingContext} gl The WebGLRenderingContext
 *        to use.
 * @param {WebGLProgram} program an existing WebGLProgram.
 * @return {module:twgl.ProgramInfo} The created ProgramInfo.
 * @memberOf module:twgl/programs
 */
function createProgramInfoFromProgram(gl, program) {
  const uniformSetters = createUniformSetters(gl, program);
  const attribSetters = createAttributeSetters(gl, program);
  const programInfo = {
    program,
    uniformSetters,
    attribSetters,
  };

  if (isWebGL2(gl)) {
    programInfo.uniformBlockSpec = createUniformBlockSpecFromProgram(gl, program);
    programInfo.transformFeedbackInfo = createTransformFeedbackInfo(gl, program);
  }

  return programInfo;
}

var quadShader = "#define GLSLIFY 1\nattribute vec4 position;attribute vec2 texcoord;varying vec2 v_texel;varying vec2 v_uv;varying float v_scale;uniform bool u_flipY;uniform vec2 u_textureSize;uniform vec2 u_screenSize;void main(){v_uv=texcoord;v_scale=floor(u_screenSize.y/u_textureSize.y+0.01);gl_Position=position;if(u_flipY){gl_Position.y*=-1.;}}"; // eslint-disable-line

var drawFrame = "precision highp float;\n#define GLSLIFY 1\nvarying vec2 v_uv;uniform sampler2D u_tex;varying float v_scale;uniform vec2 u_textureSize;uniform vec2 u_screenSize;void main(){vec2 v_texel=v_uv*u_textureSize;vec2 texel_floored=floor(v_texel);vec2 s=fract(v_texel);float region_range=0.5-0.5/v_scale;vec2 center_dist=s-0.5;vec2 f=(center_dist-clamp(center_dist,-region_range,region_range))*v_scale+0.5;vec2 mod_texel=texel_floored+f;vec2 coord=mod_texel.xy/u_textureSize.xy;gl_FragColor=texture2D(u_tex,coord);}"; // eslint-disable-line

/**
 * Flipnote renderer for the {@link https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API WebGL} API
 *
 * Only available in browser contexts
 */
class WebglCanvas {
    /**
     * Creates a new WebGlCanvas instance
     * @param el - Canvas HTML element to use as a rendering surface
     * @param width - Canvas width in CSS pixels
     * @param height - Canvas height in CSS pixels
     *
     * The ratio between `width` and `height` should be 3:4 for best results
     */
    constructor(parent, width = 640, height = 480, options = {}) {
        this.paletteBuffer = new Uint32Array(16);
        this.refs = {
            programs: [],
            shaders: [],
            textures: [],
            buffers: []
        };
        this.isCtxLost = false;
        this.handleContextLoss = (e) => {
            if (e)
                e.preventDefault();
            this.destroy();
            if (!this.isCtxLost)
                this.options.onlost();
            this.isCtxLost = true;
        };
        this.handleContextRestored = (e) => {
            this.isCtxLost = false;
            this.init();
            this.options.onrestored();
        };
        assertBrowserEnv();
        this.options = { ...WebglCanvas.defaultOptions, ...options };
        this.width = width;
        this.height = height;
        this.canvas = document.createElement('canvas');
        this.canvas.addEventListener('webglcontextlost', this.handleContextLoss, false);
        this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);
        this.canvas.className = 'FlipnoteCanvas FlipnoteCanvas--webgl';
        this.gl = this.canvas.getContext('webgl', {
            antialias: false,
            alpha: true
        });
        if (parent)
            parent.appendChild(this.canvas);
        this.init();
    }
    static isSupported() {
        if (!isBrowser)
            return false;
        let testCanvas = document.createElement('canvas');
        let testCtx = testCanvas.getContext('2d');
        const supported = testCtx !== null;
        testCanvas = null;
        testCtx = null;
        return supported;
    }
    init() {
        this.setCanvasSize(this.width, this.height);
        const gl = this.gl;
        if (this.checkContextLoss())
            return;
        this.program = this.createProgram(quadShader, drawFrame);
        this.quadBuffer = this.createScreenQuad(-1, -1, 2, 2, 1, 1);
        this.setBuffersAndAttribs(this.program, this.quadBuffer);
        this.frameTexture = this.createTexture(gl.RGBA, gl.LINEAR, gl.CLAMP_TO_EDGE);
        // set gl constants
        gl.useProgram(this.program.program);
        gl.bindTexture(gl.TEXTURE_2D, this.frameTexture);
    }
    createProgram(vertexShaderSource, fragmentShaderSource) {
        if (this.checkContextLoss())
            return;
        const gl = this.gl;
        const vert = this.createShader(gl.VERTEX_SHADER, vertexShaderSource);
        const frag = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
        const program = gl.createProgram();
        // set up shaders
        gl.attachShader(program, vert);
        gl.attachShader(program, frag);
        // link program
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const log = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            throw new Error(log);
        }
        const programInfo = createProgramInfoFromProgram(gl, program);
        this.refs.programs.push(program);
        return programInfo;
    }
    createShader(type, source) {
        if (this.checkContextLoss())
            return;
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        // test if shader compilation was successful
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(log);
        }
        this.refs.shaders.push(shader);
        return shader;
    }
    // creating a subdivided quad seems to produce slightly nicer texture filtering
    createScreenQuad(x0, y0, width, height, xSubdivs, ySubdivs) {
        if (this.checkContextLoss())
            return;
        const numVerts = (xSubdivs + 1) * (ySubdivs + 1);
        const numVertsAcross = xSubdivs + 1;
        const positions = new Float32Array(numVerts * 2);
        const texCoords = new Float32Array(numVerts * 2);
        let positionPtr = 0;
        let texCoordPtr = 0;
        for (let y = 0; y <= ySubdivs; y++) {
            for (let x = 0; x <= xSubdivs; x++) {
                const u = x / xSubdivs;
                const v = y / ySubdivs;
                positions[positionPtr++] = x0 + width * u;
                positions[positionPtr++] = y0 + height * v;
                texCoords[texCoordPtr++] = u;
                texCoords[texCoordPtr++] = v;
            }
        }
        const indices = new Uint16Array(xSubdivs * ySubdivs * 2 * 3);
        let indicesPtr = 0;
        for (let y = 0; y < ySubdivs; y++) {
            for (let x = 0; x < xSubdivs; x++) {
                // triangle 1
                indices[indicesPtr++] = (y + 0) * numVertsAcross + x;
                indices[indicesPtr++] = (y + 1) * numVertsAcross + x;
                indices[indicesPtr++] = (y + 0) * numVertsAcross + x + 1;
                // triangle 2
                indices[indicesPtr++] = (y + 0) * numVertsAcross + x + 1;
                indices[indicesPtr++] = (y + 1) * numVertsAcross + x;
                indices[indicesPtr++] = (y + 1) * numVertsAcross + x + 1;
            }
        }
        const bufferInfo = createBufferInfoFromArrays(this.gl, {
            position: {
                numComponents: 2,
                data: positions
            },
            texcoord: {
                numComponents: 2,
                data: texCoords
            },
            indices: indices
        });
        // collect references to buffer objects
        for (let name in bufferInfo.attribs)
            this.refs.buffers.push(bufferInfo.attribs[name].buffer);
        return bufferInfo;
    }
    setBuffersAndAttribs(program, buffer) {
        if (this.checkContextLoss())
            return;
        const gl = this.gl;
        setAttributes(program.attribSetters, buffer.attribs);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer.indices);
    }
    createTexture(type, minMag, wrap, width = 1, height = 1) {
        if (this.checkContextLoss())
            return;
        const gl = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minMag);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, minMag);
        gl.texImage2D(gl.TEXTURE_2D, 0, type, width, height, 0, type, gl.UNSIGNED_BYTE, null);
        this.refs.textures.push(tex);
        return tex;
    }
    /**
     * Resize the canvas surface
     * @param width - New canvas width, in CSS pixels
     * @param height - New canvas height, in CSS pixels
     *
     * The ratio between `width` and `height` should be 3:4 for best results
     */
    setCanvasSize(width, height) {
        const dpi = this.options.useDpi ? (window.devicePixelRatio || 1) : 1;
        const internalWidth = width * dpi;
        const internalHeight = height * dpi;
        this.width = width;
        this.height = height;
        this.canvas.width = internalWidth;
        this.canvas.height = internalHeight;
        this.dstWidth = internalWidth;
        this.dstHeight = internalHeight;
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        const gl = this.gl;
        if (this.checkContextLoss())
            return;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }
    /**
     * Sets the size of the input pixel arrays
     * @param width
     * @param height
     */
    setNote(note) {
        if (this.checkContextLoss())
            return;
        const gl = this.gl;
        const width = note.imageWidth;
        const height = note.imageHeight;
        this.note = note;
        this.srcWidth = width;
        this.srcHeight = height;
        // resize frame texture
        gl.bindTexture(gl.TEXTURE_2D, this.frameTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.srcWidth, this.srcHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        this.frameBuffer = new Uint32Array(width * height);
        this.frameBufferBytes = new Uint8Array(this.frameBuffer.buffer); // same memory buffer as rgbaData
        this.prevFrameIndex = undefined;
        // set canvas alt text
        this.canvas.title = note.getTitle();
    }
    /**
     * Clear the canvas
     * @param color optional RGBA color to use as a background color
     */
    clear(color) {
        if (this.checkContextLoss())
            return;
        if (color) {
            const [r, g, b, a] = color;
            this.gl.clearColor(r / 255, g / 255, b / 255, a / 255);
        }
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }
    /**
     * Draw a frame from the currently loaded Flipnote
     * @param frameIndex
     */
    drawFrame(frameIndex) {
        if (this.checkContextLoss())
            return;
        const { gl, srcWidth: textureWidth, srcHeight: textureHeight, } = this;
        // get frame pixels as RGBA buffer
        this.note.getFramePixelsRgba(frameIndex, this.frameBuffer, this.paletteBuffer);
        // clear whatever's already been drawn
        // const paperColor = note.getFramePalette(frameIndex)[0];
        // this.clear(paperColor);
        gl.clear(this.gl.COLOR_BUFFER_BIT);
        // update texture
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, textureWidth, textureHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.frameBufferBytes);
        // prep uniforms
        setUniforms(this.program, {
            u_flipY: true,
            u_tex: this.frameTexture,
            u_textureSize: [this.srcWidth, this.srcHeight],
            u_screenSize: [gl.drawingBufferWidth, gl.drawingBufferHeight],
        });
        // draw!
        gl.drawElements(gl.TRIANGLES, this.quadBuffer.numElements, this.quadBuffer.elementType, 0);
        this.prevFrameIndex = frameIndex;
    }
    forceUpdate() {
        if (this.prevFrameIndex !== undefined)
            this.drawFrame(this.prevFrameIndex);
    }
    /**
     * Returns true if the webGL context has returned an error
     */
    isErrorState() {
        const gl = this.gl;
        return gl === null || gl.getError() !== gl.NO_ERROR;
    }
    /**
     * Only a certain number of WebGL contexts can be added to a single page before the browser will start culling old contexts.
     * This method returns true if it has been culled, false if not
     */
    checkContextLoss() {
        const isLost = this.isCtxLost || this.isErrorState();
        if (isLost)
            this.handleContextLoss();
        return isLost;
    }
    /**
     *
     * @param type image mime type (`image/jpeg`, `image/png`, etc)
     * @param quality image quality where supported, between 0 and 1
     */
    getDataUrl(type, quality) {
        return this.canvas.toDataURL(type, quality);
    }
    async getBlob(type, quality) {
        return new Promise((resolve, reject) => this.canvas.toBlob(resolve, type, quality));
    }
    /**
     * Frees any resources used by this canvas instance
     */
    destroy() {
        const refs = this.refs;
        const gl = this.gl;
        const canvas = this.canvas;
        refs.shaders.forEach((shader) => {
            gl.deleteShader(shader);
        });
        refs.shaders = [];
        refs.textures.forEach((texture) => {
            gl.deleteTexture(texture);
        });
        refs.textures = [];
        refs.buffers.forEach((buffer) => {
            gl.deleteBuffer(buffer);
        });
        refs.buffers = [];
        refs.programs.forEach((program) => {
            gl.deleteProgram(program);
        });
        refs.programs = [];
        this.paletteBuffer = null;
        this.frameBuffer = null;
        this.frameBufferBytes = null;
        if (canvas && canvas.parentElement) {
            // shrink the canvas to reduce memory usage until it is garbage collected
            canvas.width = 1;
            canvas.height = 1;
            // remove canvas from dom
            canvas.parentNode.removeChild(canvas);
        }
    }
}
WebglCanvas.defaultOptions = {
    onlost: () => { },
    onrestored: () => { },
    useDpi: true
};

/**
 * Flipnote renderer for the [HTML5 2D canvas API](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D)
 */
class Html5Canvas {
    constructor(parent, width, height, options = {}) {
        this.paletteBuffer = new Uint32Array(16);
        assertBrowserEnv();
        this.options = { ...Html5Canvas.defaultOptions, ...options };
        this.width = width;
        this.height = height;
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'FlipnoteCanvas FlipnoteCanvas--html5';
        this.ctx = this.canvas.getContext('2d');
        this.srcCanvas = document.createElement('canvas');
        this.srcCtx = this.srcCanvas.getContext('2d');
        assert(this.ctx !== null && this.srcCtx !== null, 'Could not create HTML5 canvas');
        if (parent)
            parent.appendChild(this.canvas);
        this.setCanvasSize(width, height);
    }
    static isSupported() {
        if (!isBrowser)
            return false;
        let testCanvas = document.createElement('canvas');
        let testCtx = testCanvas.getContext('2d');
        const supported = testCtx !== null;
        testCanvas = null;
        testCtx = null;
        return supported;
    }
    /**
     * Resize the canvas surface
     * @param width - New canvas width, in CSS pixels
     * @param height - New canvas height, in CSS pixels
     *
     * The ratio between `width` and `height` should be 3:4 for best results
     */
    setCanvasSize(width, height) {
        const canvas = this.canvas;
        const useDpi = this.options.useDpi;
        const dpi = useDpi ? (window.devicePixelRatio || 1) : 1;
        const internalWidth = width * dpi;
        const internalHeight = height * dpi;
        this.width = width;
        this.height = height;
        this.dstWidth = internalWidth;
        this.dstHeight = internalHeight;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvas.width = internalWidth;
        canvas.height = internalHeight;
    }
    /**
     */
    setNote(note) {
        const width = note.imageWidth;
        const height = note.imageHeight;
        this.note = note;
        this.srcWidth = width;
        this.srcHeight = height;
        this.srcCanvas.width = width;
        this.srcCanvas.height = height;
        // create image data to fit note size
        this.frameImage = this.srcCtx.createImageData(width, height);
        // uint32 view of the img buffer memory
        this.frameBuffer = new Uint32Array(this.frameImage.data.buffer);
        this.prevFrameIndex = undefined;
        // set canvas alt text
        this.canvas.title = note.getTitle();
    }
    /**
     * Clear the canvas
     * @param color optional RGBA color to use as a background color
     */
    clear(color) {
        // clear framebuffer
        this.frameBuffer.fill(0);
        // clear canvas
        this.ctx.clearRect(0, 0, this.dstWidth, this.dstHeight);
        // fill canvas with paper color
        if (color) {
            const [r, g, b, a] = color;
            this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
            this.ctx.fillRect(0, 0, this.dstWidth, this.dstHeight);
        }
    }
    drawFrame(frameIndex) {
        // clear whatever's already been drawn
        this.clear();
        // optionally enable image smoothing
        if (!this.options.useSmoothing)
            this.ctx.imageSmoothingEnabled = false;
        // get frame pixels as RGBA buffer
        this.note.getFramePixelsRgba(frameIndex, this.frameBuffer, this.paletteBuffer);
        // put framebuffer pixels into the src canvas
        this.srcCtx.putImageData(this.frameImage, 0, 0);
        // composite src canvas to dst (so image scaling can be handled)
        this.ctx.drawImage(this.srcCanvas, 0, 0, this.srcWidth, this.srcHeight, 0, 0, this.dstWidth, this.dstHeight);
        this.prevFrameIndex = frameIndex;
    }
    forceUpdate() {
        if (this.prevFrameIndex !== undefined)
            this.drawFrame(this.prevFrameIndex);
    }
    getDataUrl(type, quality) {
        return this.canvas.toDataURL(type, quality);
    }
    async getBlob(type, quality) {
        return new Promise((resolve, reject) => this.canvas.toBlob(resolve, type, quality));
    }
    destroy() {
        this.frameImage = null;
        this.paletteBuffer = null;
        this.frameBuffer = null;
        this.canvas.parentNode.removeChild(this.canvas);
        this.canvas.width = 1;
        this.canvas.height = 1;
        this.canvas = null;
        this.srcCanvas.width = 1;
        this.srcCanvas.height = 1;
        this.srcCanvas = null;
    }
}
Html5Canvas.defaultOptions = {
    useDpi: true,
    useSmoothing: true,
};

class UniversalCanvas {
    constructor(parent, width = 640, height = 480, options = {}) {
        this.options = {};
        this.isReady = false;
        this.isHtml5 = false;
        this.parent = parent;
        this.options = options;
        try {
            this.renderer = new WebglCanvas(parent, width, height, {
                ...options,
                // attempt to switch renderer
                onlost: () => {
                    console.warn('WebGL failed, attempting HTML5 fallback');
                    if (this.isReady && !this.isHtml5) // if the error happened after canvas creation
                        this.switchToHtml5();
                    else
                        throw '';
                }
            });
        }
        catch {
            this.switchToHtml5();
        }
        this.isReady = true;
    }
    switchToHtml5() {
        var _a;
        const renderer = new Html5Canvas(this.parent, this.width, this.height, this.options);
        if (this.note) {
            renderer.setNote(this.note);
            renderer.prevFrameIndex = (_a = this.renderer) === null || _a === void 0 ? void 0 : _a.prevFrameIndex;
            renderer.forceUpdate();
        }
        this.isHtml5 = true;
        this.renderer = renderer;
    }
    setCanvasSize(width, height) {
        const renderer = this.renderer;
        renderer.setCanvasSize(width, height);
        this.width = width;
        this.width = height;
        this.dstWidth = renderer.dstWidth;
        this.dstHeight = renderer.dstHeight;
    }
    setNote(note) {
        this.note = note;
        this.renderer.setNote(note);
        this.prevFrameIndex = undefined;
        this.srcWidth = this.renderer.srcWidth;
        this.srcHeight = this.renderer.srcHeight;
    }
    clear(color) {
        this.renderer.clear(color);
    }
    drawFrame(frameIndex) {
        this.renderer.drawFrame(frameIndex);
        this.prevFrameIndex = frameIndex;
    }
    forceUpdate() {
        this.renderer.forceUpdate();
    }
    getDataUrl(type, quality) {
        return this.renderer.getDataUrl();
    }
    async getBlob(type, quality) {
        return this.renderer.getBlob();
    }
    destroy() {
        this.renderer.destroy();
        this.note = null;
    }
}

/** @internal */
const _AudioContext = (() => {
    if (isBrowser)
        return (window.AudioContext || window.webkitAudioContext);
    return null;
})();
/**
 * Audio player built around the {@link https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API | Web Audio API}
 *
 * Capable of playing PCM streams, with volume adjustment and an optional equalizer. Only available in browser contexts
 */
class WebAudioPlayer {
    constructor() {
        /** Whether the audio is being run through an equalizer or not */
        this.useEq = false;
        /** Whether to connect the output to an audio analyser (see {@link analyser}) */
        this.useAnalyser = false;
        /** Default equalizer settings. Credit to {@link https://www.sudomemo.net/ | Sudomemo} for these */
        this.eqSettings = [
            [31.25, 4.1],
            [62.5, 1.2],
            [125, 0],
            [250, -4.1],
            [500, -2.3],
            [1000, 0.5],
            [2000, 6.5],
            [8000, 5.1],
            [16000, 5.1]
        ];
        this._volume = 1;
        this._loop = false;
        this._startTime = 0;
        this._ctxStartTime = 0;
        this.nodeRefs = [];
        assertBrowserEnv();
    }
    /** The audio output volume. Range is 0 to 1 */
    set volume(value) {
        this.setVolume(value);
    }
    get volume() {
        return this._volume;
    }
    /** Whether the audio should loop after it has ended */
    set loop(value) {
        this._loop = value;
        if (this.source)
            this.source.loop = value;
    }
    get loop() {
        return this._loop;
    }
    getCtx() {
        if (!this.ctx)
            this.ctx = new _AudioContext();
        return this.ctx;
    }
    /**
     * Set the audio buffer to play
     * @param inputBuffer
     * @param sampleRate - For best results, this should be a multiple of 16364
     */
    setBuffer(inputBuffer, sampleRate) {
        const ctx = this.getCtx();
        const numSamples = inputBuffer.length;
        const audioBuffer = ctx.createBuffer(1, numSamples, sampleRate);
        const channelData = audioBuffer.getChannelData(0);
        if (inputBuffer instanceof Float32Array)
            channelData.set(inputBuffer, 0);
        else if (inputBuffer instanceof Int16Array) {
            for (let i = 0; i < numSamples; i++) {
                channelData[i] = inputBuffer[i] / 32768;
            }
        }
        this.buffer = audioBuffer;
        this.sampleRate = sampleRate;
    }
    connectEqNodesTo(inNode) {
        const ctx = this.getCtx();
        const eqSettings = this.eqSettings;
        let lastNode = inNode;
        eqSettings.forEach(([frequency, gain], index) => {
            const node = ctx.createBiquadFilter();
            this.nodeRefs.push(node);
            node.frequency.value = frequency;
            node.gain.value = gain;
            if (index === 0)
                node.type = 'lowshelf';
            else if (index === eqSettings.length - 1)
                node.type = 'highshelf';
            else
                node.type = 'peaking';
            lastNode.connect(node);
            lastNode = node;
        });
        return lastNode;
    }
    initNodes() {
        const ctx = this.getCtx();
        this.nodeRefs = [];
        const source = ctx.createBufferSource();
        this.nodeRefs.push(source);
        source.buffer = this.buffer;
        const gainNode = ctx.createGain();
        this.nodeRefs.push(gainNode);
        if (this.useEq) {
            const eq = this.connectEqNodesTo(source);
            eq.connect(gainNode);
        }
        else {
            source.connect(gainNode);
        }
        if (this.useAnalyser) {
            const analyserNode = ctx.createAnalyser();
            this.nodeRefs.push(analyserNode);
            this.analyser = analyserNode;
            gainNode.connect(analyserNode);
            analyserNode.connect(ctx.destination);
        }
        else {
            this.analyser = undefined;
            gainNode.connect(ctx.destination);
        }
        this.source = source;
        this.gainNode = gainNode;
        this.setVolume(this._volume);
    }
    setAnalyserEnabled(on) {
        this.useAnalyser = on;
        this.initNodes();
    }
    /**
     * Sets the audio volume level
     * @param value - range is 0 to 1
     */
    setVolume(value) {
        this._volume = value;
        if (this.gainNode) {
            // human perception of loudness is logarithmic, rather than linear
            // https://www.dr-lex.be/info-stuff/volumecontrols.html
            this.gainNode.gain.value = Math.pow(value, 2);
        }
    }
    /**
     * Begin playback from a specific point
     *
     * Note that the WebAudioPlayer doesn't keep track of audio playback itself. We rely on the {@link Player} API for that.
     * @param currentTime initial playback position, in seconds
     */
    playFrom(currentTime) {
        this.initNodes();
        this._startTime = currentTime;
        this._ctxStartTime = this.ctx.currentTime;
        this.source.loop = this._loop;
        this.source.start(0, currentTime);
    }
    /**
     * Stops the audio playback
     */
    stop() {
        if (this.source)
            this.source.stop(0);
    }
    /**
     * Get the current playback time, in seconds
     */
    getCurrentTime() {
        return this._startTime + (this.ctx.currentTime - this._ctxStartTime);
    }
    /**
     * Frees any resources used by this canvas instance
     */
    async destroy() {
        this.stop();
        const ctx = this.getCtx();
        this.nodeRefs.forEach(node => node.disconnect());
        this.nodeRefs = [];
        this.analyser = undefined;
        if (ctx.state !== 'closed' && typeof ctx.close === 'function')
            await ctx.close();
        this.buffer = null;
    }
}

/**
 * Flipnote Player API (exported as `flipnote.Player`) - provides a {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement | MediaElement}-like interface for loading Flipnotes and playing them.
 * This is intended for cases where you want to implement your own player UI, if you just want a pre-built player with some nice UI controls, check out the {@page Web Components} page instead!
 *
 * ### Create a new player
 *
 * You'll need an element in your page's HTML to act as a wrapper for the player:
 *
 * ```html
 *  <div id="player-wrapper"></div>
 * ```
 *
 * Then you can create a new `Player` instance by passing a CSS selector that matches the wrapper element, plus the desired width and height.
 *
 * ```js
 *  const player = new flipnote.Player('#player-wrapper', 320, 240);
 * ```
 *
 * ### Load a Flipnote
 *
 * Load a Flipnote from a valid {@link FlipnoteSource}:
 *
 * ```js
 * player.load('./path/to/flipnote.ppm');
 * ```
 *
 * ### Listen to events
 *
 * Use the {@link on} method to register event listeners:
 *
 * ```js
 *  player.on('play', function() {
 *    // do something when the Flipnote starts playing...
 *  });
 * ```
 */
class Player {
    /**
     * Create a new Player instance
     *
     * @param parent - Element to mount the rendering canvas to
     * @param width - Canvas width (pixels)
     * @param height - Canvas height (pixels)
     *
     * The ratio between `width` and `height` should be 3:4 for best results
     */
    constructor(parent, width, height, parserSettings = {}) {
        /** Animation duration, in seconds */
        this.duration = 0;
        /** Automatically begin playback after a Flipnote is loaded */
        this.autoplay = false;
        /** Array of events supported by this player */
        this.supportedEvents = supportedEvents;
        /** @internal */
        this._src = null;
        /** @internal */
        this._loop = false;
        /** @internal */
        this._volume = 1;
        /** @internal */
        this._muted = false;
        /** @internal */
        this._frame = null;
        /** @internal */
        this._hasEnded = false;
        /** @internal */
        this.isNoteLoaded = false;
        /** @internal */
        this.events = new Map();
        /** @internal */
        this.playbackStartTime = 0;
        /** @internal */
        this.playbackTime = 0;
        /** @internal */
        this.playbackLoopId = null;
        /** @internal */
        this.showThumbnail = true;
        /** @internal */
        this.hasPlaybackStarted = false;
        /** @internal */
        this.isPlaying = false;
        /** @internal */
        this.wasPlaying = false;
        /** @internal */
        this.isSeeking = false;
        /**
         * Playback animation loop
         * @internal
         * @category Playback Control
         */
        this.playbackLoop = (timestamp) => {
            if (!this.isPlaying)
                return;
            const now = timestamp / 1000;
            const duration = this.duration;
            const currAudioTime = this.audio.getCurrentTime();
            let currPlaybackTime = now - this.playbackStartTime;
            // try to keep playback time in sync with the audio if there's any slipping
            if (Math.abs((currPlaybackTime % duration) - (currAudioTime % duration)) > 0.01)
                currPlaybackTime = currAudioTime;
            // handle playback end, if reached
            if (currPlaybackTime >= duration) {
                if (this.loop) {
                    this.playbackStartTime = now;
                    this.emit(PlayerEvent.Loop);
                }
                else {
                    this.pause();
                    this._hasEnded = true;
                    this.emit(PlayerEvent.Ended);
                    return;
                }
            }
            this.setCurrentTime(currPlaybackTime % duration);
            this.playbackLoopId = requestAnimationFrame(this.playbackLoop);
        };
        assertBrowserEnv();
        // if parent is a string, use it to select an Element, else assume it's an Element
        const mountPoint = ('string' == typeof parent) ? document.querySelector(parent) : parent;
        this.parserSettings = parserSettings;
        this.renderer = new UniversalCanvas(mountPoint, width, height, {
            onlost: () => this.emit(PlayerEvent.Error),
            onrestored: () => this.load()
        });
        this.audio = new WebAudioPlayer();
        this.el = mountPoint;
        // this.canvasEl = this.renderer.el;
    }
    /** The currently loaded Flipnote source, if there is one. Can be overridden to load another Flipnote */
    get src() {
        return this._src;
    }
    set src(source) {
        this.load(source);
    }
    /** Indicates whether playback is currently paused */
    get paused() {
        return !this.isPlaying;
    }
    set paused(isPaused) {
        if (isPaused)
            this.pause();
        else
            this.play();
    }
    /** Current animation frame index */
    get currentFrame() {
        return this._frame;
    }
    set currentFrame(frameIndex) {
        this.setCurrentFrame(frameIndex);
    }
    /** Current animation playback position, in seconds */
    get currentTime() {
        return this.isNoteLoaded ? this.playbackTime : null;
    }
    set currentTime(value) {
        this.setCurrentTime(value);
    }
    /** Current animation playback progress, as a percentage out of 100 */
    get progress() {
        return this.isNoteLoaded ? (this.playbackTime / this.duration) * 100 : null;
    }
    set progress(value) {
        this.setProgress(value);
    }
    /** Audio volume, range `0` to `1` */
    get volume() {
        return this.getVolume();
    }
    set volume(value) {
        this.setVolume(value);
    }
    /** Audio mute state */
    get muted() {
        return this.getMuted();
    }
    set muted(value) {
        this.setMuted(value);
    }
    /** Indicates whether playback should loop once the end is reached */
    get loop() {
        return this.getLoop();
    }
    set loop(value) {
        this.setLoop(value);
    }
    /** Animation frame rate, measured in frames per second */
    get framerate() {
        return this.note.framerate;
    }
    /** Animation frame count */
    get frameCount() {
        return this.note.frameCount;
    }
    /** Animation frame speed */
    get frameSpeed() {
        return this.note.frameSpeed;
    }
    /**
     * Implementation of the `HTMLMediaElement` {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/buffered | buffered } property
     * @category HTMLVideoElement compatibility
     */
    get buffered() {
        return createTimeRanges([[0, this.duration]]);
    }
    /**
     * Implementation of the `HTMLMediaElement` {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/seekable | seekable} property
     * @category HTMLVideoElement compatibility
     */
    get seekable() {
        return createTimeRanges([[0, this.duration]]);
    }
    /**
     * Implementation of the `HTMLMediaElement` {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/currentSrc | currentSrc} property
     * @category HTMLVideoElement compatibility
     */
    get currentSrc() {
        return this._src;
    }
    /**
     * Implementation of the `HTMLVideoElement` {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/videoWidth | videoWidth} property
     * @category HTMLVideoElement compatibility
     */
    get videoWidth() {
        return this.isNoteLoaded ? this.note.imageWidth : 0;
    }
    /**
     * Implementation of the `HTMLVideoElement` {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/videoHeight | videoHeight} property
     * @category HTMLVideoElement compatibility
     */
    get videoHeight() {
        return this.isNoteLoaded ? this.note.imageHeight : 0;
    }
    /**
     * Open a Flipnote from a source
     * @category Lifecycle
     */
    async load(source = null) {
        // close currently open note first
        if (this.isNoteLoaded)
            this.closeNote();
        // keep track of source
        this._src = source;
        // if no source specified, just reset everything
        if (!source)
            return this.openNote(this.note);
        // otherwise do a normal load
        this.emit(PlayerEvent.LoadStart);
        return parseSource(source, this.parserSettings)
            .then((note) => {
            this.openNote(note);
        })
            .catch((err) => {
            this.emit(PlayerEvent.Error, err);
            throw new Error(`Error loading Flipnote: ${err.message}`);
        });
    }
    /**
     * Reload the current Flipnote
     */
    async reload() {
        if (this.note)
            return await this.load(this.note.buffer);
    }
    /**
     * Reload the current Flipnote
     */
    async updateSettings(settings) {
        this.parserSettings = settings;
        return await this.reload();
    }
    /**
     * Close the currently loaded Flipnote
     * @category Lifecycle
     */
    closeNote() {
        this.pause();
        this.note = null;
        this.isNoteLoaded = false;
        this.meta = null;
        this._src = null;
        this._frame = 0;
        // this.playbackFrame = null;
        this.playbackTime = 0;
        this.duration = 0;
        this.loop = false;
        this.isPlaying = false;
        this.wasPlaying = false;
        this.hasPlaybackStarted = false;
        this.showThumbnail = true;
        this.renderer.clear();
    }
    /**
     * Open a Flipnote into the player
     * @category Lifecycle
     */
    openNote(note) {
        if (this.isNoteLoaded)
            this.closeNote();
        this.note = note;
        this.meta = note.meta;
        this.emit(PlayerEvent.LoadedMeta);
        this.noteFormat = note.format;
        this.duration = note.duration;
        this.playbackTime = 0;
        this._frame = 0;
        this.isNoteLoaded = true;
        this.isPlaying = false;
        this.wasPlaying = false;
        this.hasPlaybackStarted = false;
        this.layerVisibility = note.layerVisibility;
        this.showThumbnail = true;
        this.audio.setBuffer(note.getAudioMasterPcm(), note.sampleRate);
        this.emit(PlayerEvent.CanPlay);
        this.emit(PlayerEvent.CanPlayThrough);
        this.setLoop(note.meta.loop);
        this.renderer.setNote(note);
        this.drawFrame(note.thumbFrameIndex);
        this.emit(PlayerEvent.LoadedData);
        this.emit(PlayerEvent.Load);
        this.emit(PlayerEvent.Ready);
        if (this.autoplay)
            this.play();
    }
    /**
     * Set the current playback time
     * @category Playback Control
     */
    setCurrentTime(value) {
        this.assertNoteLoaded();
        const i = Math.floor(value / (1 / this.framerate));
        this.setCurrentFrame(i);
        this.playbackTime = value;
        this.emit(PlayerEvent.Progress, this.progress);
    }
    /**
     * Get the current playback time
     * @category Playback Control
     */
    getCurrentTime() {
        return this.currentTime;
    }
    /**
     * Get the current time as a counter string, like `"0:00 / 1:00"`
     * @category Playback Control
     */
    getTimeCounter() {
        const currentTime = formatTime(Math.max(this.currentTime, 0));
        const duration = formatTime(this.duration);
        return `${currentTime} / ${duration}`;
    }
    /**
     * Get the current frame index as a counter string, like `"001 / 999"`
     * @category Playback Control
     */
    getFrameCounter() {
        const frame = padNumber(this.currentFrame + 1, 3);
        const total = padNumber(this.frameCount, 3);
        return `${frame} / ${total}`;
    }
    /**
     * Set the current playback progress as a percentage (`0` to `100`)
     * @category Playback Control
     */
    setProgress(value) {
        this.assertNoteLoaded();
        assertRange(value, 0, 100, 'progress');
        this.currentTime = this.duration * (value / 100);
    }
    /**
     * Get the current playback progress as a percentage (0 to 100)
     * @category Playback Control
     */
    getProgress() {
        return this.progress;
    }
    /**
     * Begin animation playback starting at the current position
     * @category Playback Control
     */
    async play() {
        this.assertNoteLoaded();
        if (this.isPlaying)
            return;
        // if the flipnote hasn't looped and is at the end, rewind it to 0
        if (this._hasEnded) {
            this.playbackTime = 0;
            this._hasEnded = false;
        }
        const now = performance.now();
        this.playbackStartTime = (now / 1000) - this.playbackTime;
        this.isPlaying = true;
        this.hasPlaybackStarted = true;
        this.playAudio();
        this.playbackLoop(now);
        this.emit(PlayerEvent.Play);
    }
    /**
     * Pause animation playback at the current position
     * @category Playback Control
     */
    pause() {
        if (!this.isPlaying)
            return;
        this.isPlaying = false;
        if (this.playbackLoopId !== null)
            cancelAnimationFrame(this.playbackLoopId);
        this.stopAudio();
        this.emit(PlayerEvent.Pause);
    }
    /**
     * Resumes animation playback if paused, otherwise pauses
     * @category Playback Control
     */
    togglePlay() {
        if (!this.isPlaying)
            this.play();
        else
            this.pause();
    }
    /**
     * Determines if playback is currently paused
     * @category Playback Control
     */
    getPaused() {
        return !this.isPlaying;
    }
    /**
     * Get the duration of the Flipnote in seconds
     * @category Playback Control
     */
    getDuration() {
        return this.duration;
    }
    /**
     * Determines if playback is looped
     * @category Playback Control
     */
    getLoop() {
        return this._loop;
    }
    /**
     * Set the playback loop
     * @category Playback Control
     */
    setLoop(loop) {
        this._loop = loop;
        this.audio.loop = loop;
    }
    /**
     * Switch the playback loop between on and off
     * @category Playback Control
     */
    toggleLoop() {
        this.setLoop(!this._loop);
    }
    /**
     * Jump to a given animation frame
     * @category Frame Control
     */
    setCurrentFrame(newFrameValue) {
        this.assertNoteLoaded();
        const newFrameIndex = Math.max(0, Math.min(Math.floor(newFrameValue), this.frameCount - 1));
        if (newFrameIndex === this.currentFrame && !this.showThumbnail)
            return;
        this._frame = newFrameIndex;
        this.drawFrame(newFrameIndex);
        this.showThumbnail = false;
        if (!this.isPlaying) {
            this.playbackTime = newFrameIndex * (1 / this.framerate);
            this.emit(PlayerEvent.SeekEnd);
        }
        this.emit(PlayerEvent.FrameUpdate, this.currentFrame);
        this.emit(PlayerEvent.Progress, this.progress);
        this.emit(PlayerEvent.TimeUpdate, this.currentFrame);
    }
    /**
     * Jump to the next animation frame
     * If the animation loops, and is currently on its last frame, it will wrap to the first frame
     * @category Frame Control
     */
    nextFrame() {
        if ((this.loop) && (this.currentFrame === this.frameCount - 1))
            this.currentFrame = 0;
        else
            this.currentFrame += 1;
        this.emit(PlayerEvent.FrameNext);
    }
    /**
     * Jump to the next animation frame
     * If the animation loops, and is currently on its first frame, it will wrap to the last frame
     * @category Frame Control
     */
    prevFrame() {
        if ((this.loop) && (this.currentFrame === 0))
            this.currentFrame = this.frameCount - 1;
        else
            this.currentFrame -= 1;
        this.emit(PlayerEvent.FramePrev);
    }
    /**
     * Jump to the last animation frame
     * @category Frame Control
     */
    lastFrame() {
        this.currentFrame = this.frameCount - 1;
        this.emit(PlayerEvent.FrameLast);
    }
    /**
     * Jump to the first animation frame
     * @category Frame Control
     */
    firstFrame() {
        this.currentFrame = 0;
        this.emit(PlayerEvent.FrameFirst);
    }
    /**
     * Jump to the thumbnail frame
     * @category Frame Control
     */
    thumbnailFrame() {
        this.currentFrame = this.note.thumbFrameIndex;
    }
    /**
     * Begins a seek operation
     * @category Playback Control
     */
    startSeek() {
        if (!this.isSeeking) {
            this.emit(PlayerEvent.SeekStart);
            this.wasPlaying = this.isPlaying;
            this.pause();
            this.isSeeking = true;
        }
    }
    /**
     * Seek the playback progress to a different position
     * @param position - animation playback position, range `0` to `1`
     * @category Playback Control
     */
    seek(position) {
        if (this.isSeeking)
            this.progress = position * 100;
    }
    /**
     * Ends a seek operation
     * @category Playback Control
     */
    endSeek() {
        if (this.isSeeking && this.wasPlaying === true)
            this.play();
        this.wasPlaying = false;
        this.isSeeking = false;
    }
    /**
     * Draws the specified animation frame to the canvas. Note that this doesn't update the playback time or anything, it simply decodes a given frame and displays it.
     * @param frameIndex
     * @category Display Control
     */
    drawFrame(frameIndex) {
        this.renderer.drawFrame(frameIndex);
    }
    /**
     * Forces the current animation frame to be redrawn
     * @category Display Control
     */
    forceUpdate() {
        this.renderer.forceUpdate();
    }
    /**
     * Resize the playback canvas to a new size
     * @param width - new canvas width (pixels)
     * @param height - new canvas height (pixels)
     *
     * The ratio between `width` and `height` should be 3:4 for best results
     *
     * @category Display Control
     */
    resize(width, height) {
        if (height !== width * .75)
            console.warn(`Canvas width to height ratio should be 3:4 for best results (got ${width}x${height})`);
        this.renderer.setCanvasSize(width, height);
        this.forceUpdate();
    }
    /**
     * Sets whether an animation layer should be visible throughout the entire animation
     * @param layer - layer index, starting at 1
     * @param value - `true` for visible, `false` for invisible
     *
     * @category Display Control
     */
    setLayerVisibility(layer, value) {
        this.note.layerVisibility[layer] = value;
        this.layerVisibility[layer] = value;
        this.forceUpdate();
    }
    /**
     * Returns the visibility state for a given layer
     * @param layer - layer index, starting at 1
     *
     * @category Display Control
     */
    getLayerVisibility(layer) {
        return this.layerVisibility[layer];
    }
    /**
     * Toggles whether an animation layer should be visible throughout the entire animation
     *
     * @category Display Control
     */
    toggleLayerVisibility(layerIndex) {
        this.setLayerVisibility(layerIndex, !this.layerVisibility[layerIndex]);
    }
    playAudio() {
        this.audio.playFrom(this.currentTime);
    }
    stopAudio() {
        this.audio.stop();
    }
    /**
     * Toggle audio Sudomemo equalizer filter
     * @category Audio Control
     */
    toggleAudioEq() {
        this.setAudioEq(!this.audio.useEq);
    }
    /**
     * Turn audio Sudomemo equalizer filter on or off
     * @category Audio Control
     */
    setAudioEq(state) {
        if (this.isPlaying) {
            this.wasPlaying = true;
            this.stopAudio();
        }
        this.audio.useEq = state;
        if (this.wasPlaying) {
            this.wasPlaying = false;
            this.playAudio();
        }
    }
    /**
     * Turn the audio off
     * @category Audio Control
     */
    mute() {
        this.setMuted(true);
    }
    /**
     * Turn the audio on
     * @category Audio Control
     */
    unmute() {
        this.setMuted(false);
    }
    /**
     * Turn the audio on or off
     * @category Audio Control
     */
    setMuted(isMute) {
        if (isMute)
            this.audio.volume = 0;
        else
            this.audio.volume = this._volume;
        this._muted = isMute;
        this.emit(PlayerEvent.VolumeChange, this.audio.volume);
    }
    /**
     * Get the audio mute state
     * @category Audio Control
     */
    getMuted() {
        return this.volume === 0 ? true : this._muted;
    }
    /**
     * Switch the audio between muted and unmuted
     * @category Audio Control
     */
    toggleMuted() {
        this.setMuted(!this._muted);
    }
    /**
     * Set the audio volume
     * @category Audio Control
     */
    setVolume(volume) {
        assertRange(volume, 0, 1, 'volume');
        this._volume = volume;
        this.audio.volume = volume;
        this.emit(PlayerEvent.VolumeChange, this.audio.volume);
    }
    /**
     * Get the current audio volume
     * @category Audio Control
     */
    getVolume() {
        return this._muted ? 0 : this._volume;
    }
    /**
     * Implementation of the `HTMLVideoElement` {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/seekToNextFrame | seekToNextFrame} method
     * @category HTMLVideoElement compatibility
     */
    seekToNextFrame() {
        this.nextFrame();
    }
    /**
     * Implementation of the `HTMLMediaElement` {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/fastSeek | fastSeek} method
     * @category HTMLVideoElement compatibility
     */
    fastSeek(time) {
        this.currentTime = time;
    }
    /**
     * Implementation of the `HTMLVideoElement` {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/getVideoPlaybackQuality | getVideoPlaybackQuality } method
     * @category HTMLVideoElement compatibility
     */
    canPlayType(mediaType) {
        switch (mediaType) {
            case 'application/x-ppm':
            case 'application/x-kwz':
            case 'video/x-ppm':
            case 'video/x-kwz':
            // lauren is planning on registering these officially
            case 'video/vnd.nintendo.ugomemo.ppm':
            case 'video/vnd.nintendo.ugomemo.kwz':
                return 'probably';
            case 'application/octet-stream':
                return 'maybe';
            // and koizumi is planning his revenge
            case 'video/vnd.nintendo.ugomemo.fykt':
            default:
                return '';
        }
    }
    /**
     * Implementation of the `HTMLVideoElement` [https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/getVideoPlaybackQuality](getVideoPlaybackQuality) method
     * @category HTMLVideoElement compatibility
     */
    getVideoPlaybackQuality() {
        const quality = {
            creationTime: 0,
            droppedVideoFrames: 0,
            // corruptedVideoFrames: 0,
            totalVideoFrames: this.frameCount
        };
        return quality;
    }
    /**
     * Implementation of the `HTMLVideoElement` [https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestPictureInPicture](requestPictureInPicture) method. Not currently working, only a stub.
     * @category HTMLVideoElement compatibility
     */
    requestPictureInPicture() {
        throw new Error('Not implemented');
    }
    /**
     * Implementation of the `HTMLVideoElement` [https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/captureStream](captureStream) method. Not currently working, only a stub.
     * @category HTMLVideoElement compatibility
     */
    captureStream() {
        throw new Error('Not implemented');
    }
    /**
     * Add an event callback
     * @category Event API
     */
    on(eventType, listener) {
        const events = this.events;
        const eventList = Array.isArray(eventType) ? eventType : [eventType];
        eventList.forEach(eventType => {
            if (!events.has(eventType))
                events.set(eventType, [listener]);
            else
                events.get(eventType).push(listener);
        });
    }
    /**
     * Remove an event callback
     * @category Event API
     */
    off(eventType, callback) {
        const events = this.events;
        const eventList = Array.isArray(eventType) ? eventType : [eventType];
        eventList.forEach(eventType => {
            if (!events.has(eventType))
                return;
            const callbackList = events.get(eventType);
            events.set(eventType, callbackList.splice(callbackList.indexOf(callback), 1));
        });
    }
    /**
     * Emit an event - mostly used internally
     * @category Event API
     */
    emit(eventType, ...args) {
        const events = this.events;
        if (eventType !== PlayerEvent.__Any && events.has(eventType)) {
            const callbackList = events.get(eventType);
            callbackList.forEach(callback => callback.apply(null, args));
            // call onwhatever() function for this event, if one has been added
            const listenerName = `on${eventType}`;
            const thisAsAny = this;
            if (typeof thisAsAny[listenerName] === 'function')
                thisAsAny[listenerName].apply(null, args);
        }
        // "any" event listeners fire for all events, and receive eventType as their first param
        if (events.has(PlayerEvent.__Any)) {
            const callbackList = events.get(PlayerEvent.__Any);
            callbackList.forEach(callback => callback.apply(null, [eventType, ...args]));
        }
    }
    /**
     * Remove all registered event callbacks
     * @category Event API
     */
    clearEvents() {
        this.events.clear();
    }
    /**
     * Destroy a Player instace
     * @category Lifecycle
     */
    async destroy() {
        this.clearEvents();
        this.emit(PlayerEvent.Destroy);
        this.closeNote();
        await this.renderer.destroy();
        await this.audio.destroy();
    }
    /**
     * Returns true if the player supports a given event or method name
     */
    supports(name) {
        const isEvent = this.supportedEvents.includes(name);
        const isMethod = typeof this[name] === 'function';
        return isEvent || isMethod;
    }
    /** @internal */
    assertNoteLoaded() {
        assert(this.isNoteLoaded, 'No Flipnote is currently loaded in this player');
    }
}

/**
 * This is a bit of a hack to get a player component class to wrap a Player instance,
 * while also inheriting all of the Player API's methods and properties.
 *
 * The resulting PlayerMixinClass will get a Player instance on this.player,
 * and all of the Player API methods and properties applied as wrappers.
 *
 * e.g.
 * - PlayerMixinClass.play() will have the same behaviour as Player.play(), but will call this.player.play() internally.
 * - PlayerMixinClass.paused will have getters and setters to match it to this.player.paused.
 * @internal
 */
function PlayerMixin(Target) {
    class PlayerMixinClass extends Target {
        // Mixin needs to re-define all the normal player properties, but most should be made readonly anyway...
        get renderer() {
            return this.player.renderer;
        }
        get audio() {
            return this.player.audio;
        }
        get canvasEl() {
            return this.player.canvasEl;
        }
        get note() {
            return this.player.note;
        }
        get noteFormat() {
            return this.player.noteFormat;
        }
        get meta() {
            return this.player.meta;
        }
        get duration() {
            return this.player.duration;
        }
        get layerVisibility() {
            return this.player.layerVisibility;
        }
        get autoplay() {
            return this.player.autoplay;
        }
        set autoplay(value) {
            this.player.autoplay = value;
        }
    }
    // add all Player API methods and getter/setter props to target
    for (let key of Reflect.ownKeys(Player.prototype)) {
        let desc = Object.getOwnPropertyDescriptor(Player.prototype, key);
        // don't override stuff that already exists, and ignore JS prototype junk
        if (key in Target.prototype || key === 'constructor' || key === 'name' || key === 'prototype') {
            continue;
        }
        // override methods to call e.g. `this.player.methodName()` when `methodName()` is called
        else if (desc.value && typeof desc.value === 'function') {
            Object.defineProperty(PlayerMixinClass.prototype, key, {
                ...desc,
                value: function (...args) {
                    return this.player[key](...args);
                }
            });
        }
        // override getters and setters so that e.g. `property` will always reflect `this.player.property`
        else if (desc.get || desc.set) {
            Object.defineProperty(PlayerMixinClass.prototype, key, {
                ...desc,
                set: function (value) {
                    this.player[key] = value;
                },
                get: function () {
                    return this.player[key];
                }
            });
        }
    }
    return PlayerMixinClass;
}

class EncoderBase {
    constructor() {
        this.dataUrl = null;
    }
    /**
     * Returns the file data as a NodeJS {@link https://nodejs.org/api/buffer.html | Buffer}
     *
     * Note: This method does not work outside of NodeJS environments
     */
    getBuffer() {
        assertNodeEnv();
        return Buffer.from(this.getArrayBuffer());
    }
    /**
     * Returns the file data as a {@link https://developer.mozilla.org/en-US/docs/Web/API/Blob | Blob}
     */
    getBlob() {
        assertBrowserEnv();
        return new Blob([this.getArrayBuffer()], {
            type: this.mimeType
        });
    }
    /**
     * Returns the file data as an {@link https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL | Object URL}
     *
     * Note: This method does not work outside of browser environments
     */
    getUrl() {
        assertBrowserEnv();
        if (this.dataUrl)
            return this.dataUrl;
        return window.URL.createObjectURL(this.getBlob());
    }
    /**
     * Revokes this file's {@link https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL | Object URL} if one has been created, use this when the url created with {@link getUrl} is no longer needed, to preserve memory.
     *
     * Note: This method does not work outside of browser environments
     */
    revokeUrl() {
        assertBrowserEnv();
        if (this.dataUrl)
            window.URL.revokeObjectURL(this.dataUrl);
    }
}

/*
  LZWEncoder.js

  Authors
  Kevin Weiner (original Java version - kweiner@fmsware.com)
  Thibault Imbert (AS3 version - bytearray.org)
  Johan Nordberg (JS version - code@johan-nordberg.com)
  James Daniel (ES6/TS version)

  Acknowledgements
  GIFCOMPR.C - GIF Image compression routines
  Lempel-Ziv compression based on 'compress'. GIF modifications by
  David Rowley (mgardi@watdcsu.waterloo.edu)
  GIF Image compression - modified 'compress'
  Based on: compress.c - File compression ala IEEE Computer, June 1984.
  By Authors: Spencer W. Thomas (decvax!harpo!utah-cs!utah-gr!thomas)
  Jim McKie (decvax!mcvax!jim)
  Steve Davies (decvax!vax135!petsd!peora!srd)
  Ken Turkowski (decvax!decwrl!turtlevax!ken)
  James A. Woods (decvax!ihnp4!ames!jaw)
  Joe Orost (decvax!vax135!petsd!joe)
*/
/** @internal */
const EOF = -1;
/** @internal */
const BITS = 12;
/** @internal */
const HSIZE = 5003; // 80% occupancy
/** @internal */
const masks = [
    0x0000, 0x0001, 0x0003, 0x0007, 0x000F, 0x001F,
    0x003F, 0x007F, 0x00FF, 0x01FF, 0x03FF, 0x07FF,
    0x0FFF, 0x1FFF, 0x3FFF, 0x7FFF, 0xFFFF
];
/** @internal */
class LzwCompressor {
    constructor(width, height, colorDepth) {
        this.accum = new Uint8Array(256);
        this.htab = new Int32Array(HSIZE);
        this.codetab = new Int32Array(HSIZE);
        this.cur_accum = 0;
        this.cur_bits = 0;
        this.curPixel = 0;
        this.free_ent = 0; // first unused entry
        // block compression parameters -- after all codes are used up,
        // and compression rate changes, start over.
        this.clear_flg = false;
        // Algorithm: use open addressing double hashing (no chaining) on the
        // prefix code / next character combination. We do a variant of Knuth's
        // algorithm D (vol. 3, sec. 6.4) along with G. Knott's relatively-prime
        // secondary probe. Here, the modular division first probe is gives way
        // to a faster exclusive-or manipulation. Also do block compression with
        // an adaptive reset, whereby the code table is cleared when the compression
        // ratio decreases, but after the table fills. The variable-length output
        // codes are re-sized at this point, and a special CLEAR code is generated
        // for the decompressor. Late addition: construct the table according to
        // file size for noticeable speed improvement on small files. Please direct
        // questions about this implementation to ames!jaw.
        this.g_init_bits = undefined;
        this.ClearCode = undefined;
        this.EOFCode = undefined;
        this.width = width;
        this.height = height;
        this.colorDepth = colorDepth;
        this.reset();
    }
    reset() {
        this.initCodeSize = Math.max(2, this.colorDepth);
        this.accum.fill(0);
        this.htab.fill(0);
        this.codetab.fill(0);
        this.cur_accum = 0;
        this.cur_bits = 0;
        this.curPixel = 0;
        this.free_ent = 0; // first unused entry
        this.maxcode;
        // block compression parameters -- after all codes are used up,
        // and compression rate changes, start over.
        this.clear_flg = false;
        // Algorithm: use open addressing double hashing (no chaining) on the
        // prefix code / next character combination. We do a variant of Knuth's
        // algorithm D (vol. 3, sec. 6.4) along with G. Knott's relatively-prime
        // secondary probe. Here, the modular division first probe is gives way
        // to a faster exclusive-or manipulation. Also do block compression with
        // an adaptive reset, whereby the code table is cleared when the compression
        // ratio decreases, but after the table fills. The variable-length output
        // codes are re-sized at this point, and a special CLEAR code is generated
        // for the decompressor. Late addition: construct the table according to
        // file size for noticeable speed improvement on small files. Please direct
        // questions about this implementation to ames!jaw.
        this.g_init_bits = undefined;
        this.ClearCode = undefined;
        this.EOFCode = undefined;
    }
    // Add a character to the end of the current packet, and if it is 254
    // characters, flush the packet to disk.
    char_out(c, outs) {
        this.accum[this.a_count++] = c;
        if (this.a_count >= 254)
            this.flush_char(outs);
    }
    // Clear out the hash table
    // table clear for block compress
    cl_block(outs) {
        this.cl_hash(HSIZE);
        this.free_ent = this.ClearCode + 2;
        this.clear_flg = true;
        this.output(this.ClearCode, outs);
    }
    // Reset code table
    cl_hash(hsize) {
        for (var i = 0; i < hsize; ++i)
            this.htab[i] = -1;
    }
    compress(init_bits, outs) {
        var fcode, c, i, ent, disp, hsize_reg, hshift;
        // Set up the globals: this.g_init_bits - initial number of bits
        this.g_init_bits = init_bits;
        // Set up the necessary values
        this.clear_flg = false;
        this.n_bits = this.g_init_bits;
        this.maxcode = this.get_maxcode(this.n_bits);
        this.ClearCode = 1 << (init_bits - 1);
        this.EOFCode = this.ClearCode + 1;
        this.free_ent = this.ClearCode + 2;
        this.a_count = 0; // clear packet
        ent = this.nextPixel();
        hshift = 0;
        for (fcode = HSIZE; fcode < 65536; fcode *= 2)
            ++hshift;
        hshift = 8 - hshift; // set hash code range bound
        hsize_reg = HSIZE;
        this.cl_hash(hsize_reg); // clear hash table
        this.output(this.ClearCode, outs);
        outer_loop: while ((c = this.nextPixel()) != EOF) {
            fcode = (c << BITS) + ent;
            i = (c << hshift) ^ ent; // xor hashing
            if (this.htab[i] === fcode) {
                ent = this.codetab[i];
                continue;
            }
            else if (this.htab[i] >= 0) { // non-empty slot
                disp = hsize_reg - i; // secondary hash (after G. Knott)
                if (i === 0) {
                    disp = 1;
                }
                do {
                    if ((i -= disp) < 0) {
                        i += hsize_reg;
                    }
                    if (this.htab[i] === fcode) {
                        ent = this.codetab[i];
                        continue outer_loop;
                    }
                } while (this.htab[i] >= 0);
            }
            this.output(ent, outs);
            ent = c;
            if (this.free_ent < 1 << BITS) {
                this.codetab[i] = this.free_ent++; // code -> hasthis.htable
                this.htab[i] = fcode;
            }
            else {
                this.cl_block(outs);
            }
        }
        // Put out the final code.
        this.output(ent, outs);
        this.output(this.EOFCode, outs);
    }
    encode(pixels, outs) {
        this.pixels = pixels;
        outs.writeByte(this.initCodeSize); // write 'initial code size' byte
        this.remaining = this.width * this.height; // reset navigation variables
        this.curPixel = 0;
        this.compress(this.initCodeSize + 1, outs); // compress and write the pixel data
        outs.writeByte(0); // write block terminator
    }
    // Flush the packet to disk, and reset the this.accumulator
    flush_char(outs) {
        if (this.a_count > 0) {
            outs.writeByte(this.a_count);
            outs.writeBytes(this.accum, 0, this.a_count);
            this.a_count = 0;
        }
    }
    get_maxcode(n_bits) {
        return (1 << n_bits) - 1;
    }
    // Return the next pixel from the image
    nextPixel() {
        if (this.remaining === 0)
            return EOF;
        --this.remaining;
        var pix = this.pixels[this.curPixel++];
        return pix & 0xff;
    }
    output(code, outs) {
        this.cur_accum &= masks[this.cur_bits];
        if (this.cur_bits > 0)
            this.cur_accum |= (code << this.cur_bits);
        else
            this.cur_accum = code;
        this.cur_bits += this.n_bits;
        while (this.cur_bits >= 8) {
            this.char_out((this.cur_accum & 0xff), outs);
            this.cur_accum >>= 8;
            this.cur_bits -= 8;
        }
        // If the next entry is going to be too big for the code size,
        // then increase it, if possible.
        if (this.free_ent > this.maxcode || this.clear_flg) {
            if (this.clear_flg) {
                this.maxcode = this.get_maxcode(this.n_bits = this.g_init_bits);
                this.clear_flg = false;
            }
            else {
                ++this.n_bits;
                if (this.n_bits == BITS)
                    this.maxcode = 1 << BITS;
                else
                    this.maxcode = this.get_maxcode(this.n_bits);
            }
        }
        if (code == this.EOFCode) {
            // At EOF, write the rest of the buffer.
            while (this.cur_bits > 0) {
                this.char_out((this.cur_accum & 0xff), outs);
                this.cur_accum >>= 8;
                this.cur_bits -= 8;
            }
            this.flush_char(outs);
        }
    }
}

/**
 * GIF image encoder
 *
 * Supports static single-frame GIF export as well as animated GIF
 * @category File Encoder
 */
class GifImage extends EncoderBase {
    /**
     * Create a new GIF image object
     * @param width image width
     * @param height image height
     * @param settings whether the gif should loop, the delay between frames, etc. See {@link GifEncoderSettings}
     */
    constructor(width, height, settings = {}) {
        super();
        this.mimeType = 'gif/image';
        /** Number of current GIF frames */
        this.frameCount = 0;
        this.width = width;
        this.height = height;
        this.data = new ByteArray();
        this.settings = { ...GifImage.defaultSettings, ...settings };
        this.compressor = new LzwCompressor(width, height, settings.colorDepth);
    }
    /**
     * Create an animated GIF image from a Flipnote
     *
     * This will encode the entire animation, so depending on the number of frames it could take a while to return.
     * @param flipnote {@link Flipnote} object ({@link PpmParser} or {@link KwzParser} instance)
     * @param settings whether the gif should loop, the delay between frames, etc. See {@link GifEncoderSettings}
     */
    static fromFlipnote(flipnote, settings = {}) {
        var _a;
        const gif = new GifImage(flipnote.imageWidth, flipnote.imageHeight, {
            delay: 100 / flipnote.framerate,
            repeat: ((_a = flipnote.meta) === null || _a === void 0 ? void 0 : _a.loop) ? -1 : 0,
            ...settings
        });
        gif.palette = flipnote.globalPalette;
        for (let frameIndex = 0; frameIndex < flipnote.frameCount; frameIndex++)
            gif.writeFrame(flipnote.getFramePixels(frameIndex));
        gif.finish();
        return gif;
    }
    /**
     * Create an GIF image from a single Flipnote frame
     * @param flipnote
     * @param frameIndex animation frame index to encode
     * @param settings whether the gif should loop, the delay between frames, etc. See {@link GifEncoderSettings}
     */
    static fromFlipnoteFrame(flipnote, frameIndex, settings = {}) {
        const gif = new GifImage(flipnote.imageWidth, flipnote.imageHeight, {
            delay: 0,
            repeat: 0,
            ...settings,
        });
        gif.palette = flipnote.globalPalette;
        gif.writeFrame(flipnote.getFramePixels(frameIndex));
        gif.finish();
        return gif;
    }
    /**
     * Add a frame to the GIF image
     * @param pixels Raw pixels to encode, must be an uncompressed 8bit array of palette indices with a size matching image width * image height
     */
    writeFrame(pixels) {
        if (this.frameCount === 0)
            this.writeFirstFrame(pixels);
        else
            this.writeAdditionalFrame(pixels);
        this.frameCount += 1;
    }
    finish() {
        this.data.writeByte(0x3B);
    }
    writeFirstFrame(pixels) {
        this.writeHeader();
        this.writeLogicalScreenDescriptor();
        this.writeColorTable();
        this.writeNetscapeExt();
        this.writeGraphicControlExt();
        this.writeImageDescriptor();
        this.writePixels(pixels);
    }
    writeAdditionalFrame(pixels) {
        this.writeGraphicControlExt();
        this.writeImageDescriptor();
        this.writePixels(pixels);
    }
    writeHeader() {
        this.data.writeChars('GIF89a');
    }
    writeGraphicControlExt() {
        this.data.writeByte(0x21); // extension introducer
        this.data.writeByte(0xf9); // GCE label
        this.data.writeByte(4); // data block size
        // packed fields
        this.data.writeByte(0);
        this.data.writeU16(this.settings.delay); // delay x 1/100 sec
        this.data.writeByte(0); // transparent color index
        this.data.writeByte(0); // block terminator
    }
    writeLogicalScreenDescriptor() {
        const palette = this.palette;
        const colorDepth = this.settings.colorDepth;
        const globalColorTableFlag = 1;
        const sortFlag = 0;
        const globalColorTableSize = this.colorTableSize(palette.length) - 1;
        const fields = (globalColorTableFlag << 7) |
            ((colorDepth - 1) << 4) |
            (sortFlag << 3) |
            globalColorTableSize;
        const backgroundColorIndex = 0;
        const pixelAspectRatio = 0;
        this.data.writeU16(this.width);
        this.data.writeU16(this.height);
        this.data.writeBytes([fields, backgroundColorIndex, pixelAspectRatio]);
    }
    writeNetscapeExt() {
        this.data.writeByte(0x21); // extension introducer
        this.data.writeByte(0xff); // app extension label
        this.data.writeByte(11); // block size
        this.data.writeChars('NETSCAPE2.0'); // app id + auth code
        this.data.writeByte(3); // sub-block size
        this.data.writeByte(1); // loop sub-block id
        this.data.writeU16(this.settings.repeat); // loop count (extra iterations, 0=repeat forever)
        this.data.writeByte(0); // block terminator
    }
    writeColorTable() {
        const palette = this.palette;
        const colorTableLength = 1 << this.colorTableSize(palette.length);
        for (let i = 0; i < colorTableLength; i++) {
            let color = [0, 0, 0];
            if (i < palette.length) {
                color = palette[i];
            }
            this.data.writeByte(color[0]);
            this.data.writeByte(color[1]);
            this.data.writeByte(color[2]);
        }
    }
    writeImageDescriptor() {
        this.data.writeByte(0x2c); // image separator
        this.data.writeU16(0); // x position
        this.data.writeU16(0); // y position
        this.data.writeU16(this.width); // image size
        this.data.writeU16(this.height);
        this.data.writeByte(0); // global palette
    }
    colorTableSize(length) {
        return Math.max(Math.ceil(Math.log2(length)), 1);
    }
    writePixels(pixels) {
        this.compressor.colorDepth = this.settings.colorDepth;
        this.compressor.reset();
        this.compressor.encode(pixels, this.data);
    }
    /**
     * Returns the GIF image data as an {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer | ArrayBuffer}
     */
    getArrayBuffer() {
        return this.data.getBuffer();
    }
    /**
      * Returns the GIF image data as an {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/Image | Image} object
      *
      * Note: This method does not work outside of browser environments
      */
    getImage() {
        assertBrowserEnv();
        const img = new Image(this.width, this.height);
        img.src = this.getUrl();
        return img;
    }
}
/**
 * Default GIF encoder settings
 */
GifImage.defaultSettings = {
    // transparentBg: false,
    delay: 100,
    repeat: -1,
    colorDepth: 8
};

/**
 * Wav audio object. Used to create a {@link https://en.wikipedia.org/wiki/WAV | WAV} file from a PCM audio stream or a {@link Flipnote} object.
 *
 * Currently only supports PCM s16_le audio encoding.
 *
 * @category File Encoder
 */
class WavAudio extends EncoderBase {
    /**
     * Create a new WAV audio object
     * @param sampleRate audio samplerate
     * @param channels number of audio channels
     * @param bitsPerSample number of bits per sample
     */
    constructor(sampleRate, channels = 1, bitsPerSample = 16) {
        super();
        this.sampleRate = sampleRate;
        this.channels = channels;
        this.bitsPerSample = bitsPerSample;
        // Write WAV file header
        // Reference: http://www.topherlee.com/software/pcm-tut-wavformat.html
        const headerBuffer = new ArrayBuffer(44);
        const header = new DataStream(headerBuffer);
        // 'RIFF' indent
        header.writeChars('RIFF');
        // filesize (set later)
        header.writeUint32(0);
        // 'WAVE' indent
        header.writeChars('WAVE');
        // 'fmt ' section header
        header.writeChars('fmt ');
        // fmt section length
        header.writeUint32(16);
        // specify audio format is pcm (type 1)
        header.writeUint16(1);
        // number of audio channels
        header.writeUint16(this.channels);
        // audio sample rate
        header.writeUint32(this.sampleRate);
        // byterate = (sampleRate * bitsPerSample * channelCount) / 8
        header.writeUint32((this.sampleRate * this.bitsPerSample * this.channels) / 8);
        // blockalign = (bitsPerSample * channels) / 8
        header.writeUint16((this.bitsPerSample * this.channels) / 8);
        // bits per sample
        header.writeUint16(this.bitsPerSample);
        // 'data' section header
        header.writeChars('data');
        // data section length (set later)
        header.writeUint32(0);
        this.header = header;
        this.pcmData = null;
    }
    /**
     * Create a WAV audio file from a Flipnote's master audio track
     * @param flipnote
     * @param trackId
     */
    static fromFlipnote(note) {
        const sampleRate = note.sampleRate;
        const wav = new WavAudio(sampleRate, 1, 16);
        const pcm = note.getAudioMasterPcm(sampleRate);
        wav.writeSamples(pcm);
        return wav;
    }
    /**
     * Create a WAV audio file from a given Flipnote audio track
     * @param flipnote
     * @param trackId
     */
    static fromFlipnoteTrack(flipnote, trackId) {
        const sampleRate = flipnote.sampleRate;
        const wav = new WavAudio(sampleRate, 1, 16);
        const pcm = flipnote.getAudioTrackPcm(trackId, sampleRate);
        wav.writeSamples(pcm);
        return wav;
    }
    /**
     * Add PCM audio frames to the WAV
     * @param pcmData signed int16 PCM audio samples
     */
    writeSamples(pcmData) {
        let header = this.header;
        // fill in filesize
        header.seek(4);
        header.writeUint32(header.byteLength + pcmData.byteLength);
        // fill in data section length
        header.seek(40);
        header.writeUint32(pcmData.byteLength);
        this.pcmData = pcmData;
    }
    /**
     * Returns the WAV audio data as an {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer | ArrayBuffer}
     */
    getArrayBuffer() {
        const headerBytes = this.header.bytes;
        const pcmBytes = new Uint8Array(this.pcmData.buffer);
        const resultBytes = new Uint8Array(this.header.byteLength + this.pcmData.byteLength);
        resultBytes.set(headerBytes);
        resultBytes.set(pcmBytes, headerBytes.byteLength);
        return resultBytes.buffer;
    }
}

// Entrypoint for web and node
/**
 * flipnote.js library version (exported as `flipnote.version`). You can find the latest version on the project's [NPM](https://www.npmjs.com/package/flipnote.js) page.
 */
const version = "5.6.7"; // replaced by @rollup/plugin-replace; see rollup.config.js

export { CanvasInterface, FlipnoteAudioTrack, FlipnoteFormat, FlipnoteRegion, FlipnoteSoundEffectTrack, GifImage, Html5Canvas, KwzParser, Player, PlayerEvent, PlayerMixin, PpmParser, UniversalCanvas, WavAudio, WebAudioPlayer, WebglCanvas, parseSource, fsid as utils, version };
