import { 
  LitElement,
  html,
  css,
  query,
  customElement,
  internalProperty,
  PropertyValues,
  property,
} from 'lit-element';

import { Player, PlayerEvent } from '../player';
import { PlayerMixin } from './PlayerMixin';

import { SliderComponent } from './SliderComponent';
import { IconComponent } from './IconComponent';

/**
 * @category Web Component
 */
@customElement('flipnote-player')
export class PlayerComponent extends PlayerMixin(LitElement) {

  static get styles() {
    return css`
      .Button {
        border: 0;
        padding: 0;
        outline: 0;
        -webkit-appearance: none;
        display: block;
        font-family: inherit;
        font-size: inherit;
        text-align: center;
        cursor: pointer;
        background: var(--flipnote-player-button-background, #FFD3A6);
        color: var(--flipnote-player-button-color, #F36A2D);
        border-radius: 4px;
      }

      .Button flipnote-player-icon {
        display: block;
      }

      .Player {
        display: inline-block;
        position: relative;
        font-family: var(--flipnote-player-font-family, sans-serif);
        /* width: 100%; */
        /* user-select: none; */
      }

      .CanvasArea {
        position: relative;
      }

      .PlayerCanvas {
        position: relative;
        display: block;
      }

      .Overlay {
        position: absolute;
        top: 0;
        left: 0;
        background: #ebf0f3;
        color: #4b4c53;
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
      }

      .Overlay--error {
        background: #ff8b8b;
        color: #ca2a32;
      }

      @keyframes spin {
        from {
          transform: rotateZ(0);
        }
        to {
          transform: rotateZ(360deg);
        }
      }

      .LoaderIcon {
        animation: spin infinite 1.2s linear;
      }

      .Controls {
        background: var(--flipnote-player-controls-background, none);
      }

      .MuteIcon {
        width: 28px;
        height: 28px;
      }

      .Controls__row,
      .Controls__groupLeft,
      .Controls__groupRight {
        display: flex;
        align-items: center;
      }

      .Controls__groupLeft {
        margin-right: auto;
      }

      .Controls__groupRight {
        margin-left: auto;
      }

      .Controls__playButton {
        height: 32px;
        width: 32px;
        padding: 2px;
      }

      .MuteIcon {
        width: 28px;
        height: 28px;
      }

      .LoaderIcon {
        width: 40px;
        height: 40px;
      }

      .Controls__frameCounter {
        font-variant-numeric: tabular-nums;
      }

      .Controls__progressBar {
        flex: 1;
      }

      .Controls--compact .Controls__playButton {
        margin-right: 8px;
      }

      .Controls--compact .Controls__progressBar {
        flex: 1;
      }

      .Controls--default .Controls__playButton {
        margin-right: 8px;
      }

      .Controls--default .Controls__volumeBar {
        width: 70px;
        margin-left: 8px;
      }
    `;
  }

  @property({ type: String })
  public controls: string;

  @property({ type: String })
  get src() {
    return this.player.src;
  }

  set src(src: any) {
    if (this._isPlayerAvailable)
      this.player.src = src;
    this._playerSrc = src;
  }

  @property({ type: Boolean })
  get autoplay() {
    return this.player.autoplay;
  }

  set autoplay(value: boolean) {
    this.player.autoplay = value;
  }

  @internalProperty()
  private _progress = 0;

  @internalProperty()
  private _counter = '';

  @internalProperty()
  private _isLoading = false;

  @internalProperty()
  private _isError = false;

  @internalProperty()
  private _isPlaying = false;

  @internalProperty()
  private _isMuted = false;

  @internalProperty()
  private _volumeLevel = 0;

  private _isPlayerAvailable = false;
  private _playerSrc: any;

  @query('#canvas')
  private playerCanvas: HTMLCanvasElement;
  
  constructor() {
    super();
  }

  /** @internal */
  render() {
    return html`
      <div class="Player" @keydown=${ this.handleKeyInput }>
        <div class="CanvasArea">
          <canvas class="PlayerCanvas" id="canvas"></canvas>
          ${ this._isLoading ?
            html`<div class="Overlay">
              <flipnote-player-icon icon="loader" class="LoaderIcon"></flipnote-player-icon>
            </div>` :
            ''
          }
          ${ this._isError ?
            html`<div class="Overlay Overlay--error">
              Error
            </div>` :
            ''
          }
        </div>
        ${ this.renderControls() }
      </div>
    `;
  }

  /** @internal */
  renderControls() {
    if (this.controls === 'compact') {
      return html`
        <div class="Controls Controls--compact Controls__row">
          <button @click=${ this.togglePlay } class="Button Controls__playButton">
            <flipnote-player-icon icon=${ this._isPlaying ? 'pause' : 'play' }></flipnote-player-icon>
          </button>
          <flipnote-player-slider 
            class="Controls__progressBar"
            value=${ this._progress }
            @change=${ this.handleProgressSliderChange }
            @inputstart=${ this.handleProgressSliderInputStart }
            @inputend=${ this.handleProgressSliderInputEnd }
          />
          </flipnote-player-slider>
        </div>
      `;
    }
    else {
      return html`
        <div class="Controls Controls--default">
          <flipnote-player-slider 
            class="Controls__progressBar"
            value=${ this._progress }
            @change=${ this.handleProgressSliderChange }
            @inputstart=${ this.handleProgressSliderInputStart }
            @inputend=${ this.handleProgressSliderInputEnd }
          />
          </flipnote-player-slider>
          <div class="Controls__row">
            <div class="Controls__groupLeft">
              <button @click=${ this.togglePlay } class="Button Controls__playButton">
                <flipnote-player-icon icon=${ this._isPlaying ? 'pause' : 'play' }></flipnote-player-icon>
              </button>
              <span class="Controls__frameCounter">
                ${ this._counter }
              </span>
            </div>
            <div class="Controls__groupRight">
              <flipnote-player-icon 
                class="MuteIcon"
                @click=${ this.toggleMuted }
                icon=${ this._isMuted ? 'volumeOff' : 'volumeOn' }
              >
              </flipnote-player-icon>
              <flipnote-player-slider
                class="Controls__volumeBar"
                value=${ this._volumeLevel }
                @change=${ this.handleVolumeBarChange }
              >
              </flipnote-player-slider>
            </div>
          </div>
        </div>
      `;
    }
  }

  /** @internal */
  firstUpdated(changedProperties: PropertyValues) {
    const player = new Player(this.playerCanvas, 320, 240);
    player.on(PlayerEvent.LoadStart, () => {
      this._isLoading = true;
    });
    player.on([PlayerEvent.Load, PlayerEvent.Close, PlayerEvent.Progress], () => {
      this._isLoading = false;
      this._isError = false;
      this._progress = player.getProgress() / 100;
      this._counter = player.getFrameCounter();
    });
    player.on(PlayerEvent.Play, () => {
      this._isPlaying = true;
    });
    player.on(PlayerEvent.Pause, () => {
      this._isPlaying = false;
    });
    player.on([PlayerEvent.Load, PlayerEvent.VolumeChange], () => {
      this._volumeLevel = player.volume;
      this._isMuted = player.muted;
    });
    player.on([PlayerEvent.Error], () => {
      this._isLoading = false;
      this._isError = true;
    });
    // catch any player event and dispatch it as a DOM event
    player.on(PlayerEvent.__Any, (eventName: string, args: any[]) => {
      this.dispatchEvent(new Event(eventName));
    });
    if (this._playerSrc) {
      player.load(this._playerSrc);
    }
    this.player = player;
    this._isPlayerAvailable = true;
  }

  /** @internal */
  disconnectedCallback() {
    // clean up webgl and buffer stuff if this element is removed from DOM
    this.destroy();
  }

  private handleKeyInput = (e: KeyboardEvent) => {
    e.preventDefault();
    switch(e.key.toLowerCase()) {
      case ' ':
        this.togglePlay();
        break;
      case 'a':
      case 'arrowleft':
        if (e.shiftKey) 
          this.firstFrame();
        else 
          this.prevFrame();
        break;
      case 'd':
      case 'arrowright':
        if (e.shiftKey)
          this.lastFrame();
        else
          this.nextFrame();
        break;
    }
  }

  private handleProgressSliderChange = (e: CustomEvent) => {
    this.seek(e.detail.value);
  }

  private handleProgressSliderInputStart = () => {
    this.startSeek();
  }

  private handleProgressSliderInputEnd = () => {
    this.endSeek();
  }

  private handleVolumeBarChange = (e: CustomEvent) => {
    this.setVolume(e.detail.value);
  }

}