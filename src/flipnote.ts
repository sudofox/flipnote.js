import * as utils from './utils/index';
import { parseSource, KwzParser, PpmParser } from './parsers/index'; 
import { Player } from './player/index';
import { GifEncoder, WavEncoder } from './encoders/index';
// bitmap encoder is deprecated in favor of gif
// import { BitmapEncoder } from './encoders';

export default {
  version: VERSION,
  player: Player,
  parseSource,
  kwzParser: KwzParser,
  ppmParser: PpmParser,
  // bitmapEncoder: BitmapEncoder,
  gifEncoder: GifEncoder,
  wavEncoder: WavEncoder,
  utils,
}