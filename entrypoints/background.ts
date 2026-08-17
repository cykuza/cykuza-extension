import '../src/platform/bufferPolyfill';
import {
  registerAlarmHandlers,
  registerMessageRouter,
  registerPortHandlers,
} from '../src/sw/router';

export default defineBackground(() => {
  registerMessageRouter();
  registerPortHandlers();
  registerAlarmHandlers();
});
