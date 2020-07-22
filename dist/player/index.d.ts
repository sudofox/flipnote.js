import { Flipnote, FlipnoteMeta } from '../parsers';
import { WebglCanvas } from '../webgl';
interface PlayerLayerVisibility {
    [key: number]: boolean;
}
/** flipnote player API, based on HTMLMediaElement (https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement) */
export declare class Player {
    canvas: WebglCanvas;
    el: HTMLCanvasElement;
    type: string;
    note: Flipnote;
    meta: FlipnoteMeta;
    loop: boolean;
    paused: boolean;
    duration: number;
    layerVisibility: PlayerLayerVisibility;
    private isOpen;
    private customPalette;
    private events;
    private _frame;
    private _time;
    private hasPlaybackStarted;
    private wasPlaying;
    private isSeeking;
    private audioPlayer;
    constructor(el: string | HTMLCanvasElement, width: number, height: number);
    get currentFrame(): number;
    set currentFrame(frameIndex: number);
    get currentTime(): number;
    set currentTime(value: number);
    get progress(): number;
    set progress(value: number);
    get volume(): number;
    set volume(value: number);
    get muted(): boolean;
    set muted(value: boolean);
    get framerate(): number;
    get frameCount(): number;
    get frameSpeed(): number;
    get audiorate(): number;
    open(source: any): Promise<void>;
    close(): void;
    load(note: Flipnote): void;
    private playAudio;
    private stopAudio;
    play(): void;
    pause(): void;
    togglePlay(): void;
    setFrame(frameIndex: number): void;
    nextFrame(): void;
    prevFrame(): void;
    lastFrame(): void;
    firstFrame(): void;
    thumbnailFrame(): void;
    startSeek(): void;
    seek(progress: number): void;
    endSeek(): void;
    drawFrame(frameIndex: number): void;
    forceUpdate(): void;
    resize(width: number, height: number): void;
    setLayerVisibility(layerIndex: number, value: boolean): void;
    toggleLayerVisibility(layerIndex: number): void;
    on(eventType: string, callback: Function): void;
    off(eventType: string, callback: Function): void;
    emit(eventType: string, ...args: any): void;
    clearEvents(): void;
    destroy(): void;
}
export {};
