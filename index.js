import { registerRootComponent } from 'expo';
import TrackPlayer from '@rntp/player';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Must be registered after the root component - runs as a headless task on
// Android so lock screen / notification remote commands work in the
// background. See TrackPlayerService.js.
TrackPlayer.registerPlaybackService(() => require('./TrackPlayerService'));
