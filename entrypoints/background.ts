import '../src/platform/bufferPolyfill';
import {
  registerAlarmHandlers,
  registerMessageRouter,
  registerWatchPort,
} from '../src/sw/router';

export default defineBackground(() => {
  registerMessageRouter();
  registerWatchPort();
  registerAlarmHandlers();
});
