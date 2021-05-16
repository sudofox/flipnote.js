import { Flipnote } from '../parsers';
import { ByteArray, isBrowser, isWebWorker } from '../utils';

export class WebVideo {

  public width: number;
  public height: number;
  public framerate: number;
  public hasErrored: boolean = false;

  private encoder: VideoEncoder;
  private output: ByteArray;
  private lastError: Error;

  static isSupported() {
    return (isBrowser || isWebWorker) && VideoEncoder !== undefined;
  }

  static async fromFlipnote(note: Flipnote) {
    const video = new WebVideo(note.imageWidth, note.imageHeight, note.framerate);
    for (let i = 0; i < note.frameCount; i++) {
      const pixels = note.getFramePixelsRgba(i);
      await video.addFrame(pixels);
    }
    video.finish();
    return video;
  }

  constructor(width: number, height: number, framerate: number) {
    this.width = width;
    this.height = height;
    this.framerate = framerate;
    this.init();
  }

  public init() {
    this.output = new ByteArray();
    this.encoder = new VideoEncoder({
      output: (chunk) => this.onChunk(chunk),
      error: (e) => this.onError(e)
    });
    this.checkError();
    this.encoder.configure({
      codec: 'vp8',
      width: this.width,
      height: this.height,
      bitrate: 8_000_000, // 8 Mbps
      framerate: this.framerate,
    });
    this.checkError();
  }

  public async addFrame(rgba: Uint32Array, isNew: boolean = true) {
    this.checkError();
    // convert RGBA pixel buffer to ImageBitmap object
    const frameBitmap = await this.getImageBitmap(rgba);
    // create video frame
    const frame = new VideoFrame(frameBitmap);
    // add frame to encoder queue
    this.encoder.encode(frame);
    this.checkError();
    // wait for the frame to be encoded before continuing
    // we never want to skip a frame
    await this.encoder.flush();
    this.checkError();
    // clean up frame and ImageBitmap resources
    frame.close();
    frameBitmap.close();
  }

  public finish() {
    this.checkError();
    this.encoder.close();
  }

  private onChunk(chunk: EncodedVideoChunk) {
    this.output.writeBytes(new Uint8Array(chunk.data));
  }

  private onError(e: Error) {
    this.hasErrored = true;
    this.lastError = e;
  }

  private checkError() {
    if (this.hasErrored)
      throw this.lastError;
  }

  private async getImageBitmap(rgba: Uint32Array) {
    // view rgba buffer as uint8 array (uses the same underlying memory)
    const uint8_rgba = new Uint8ClampedArray(rgba.buffer);
    const imageData = new ImageData(uint8_rgba, this.width, this.height)
    return await createImageBitmap(imageData);
  }

  public getArrayBuffer() {
    const data = this.output.getData();
    return data.buffer;
  }

  public getBlob(): Blob {
    return new Blob([this.getArrayBuffer()], {
      type: 'octet/stream'
    });
  }

  // temporary
  public save(name='test.vp8') {
    const a = document.createElement("a");
    document.body.appendChild(a);
    a.style.cssText = 'display: none';
    const url = window.URL.createObjectURL(this.getBlob());
    a.href = url;
    a.download = name;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}