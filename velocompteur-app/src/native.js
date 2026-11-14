// Empaqueté par esbuild en www/native.js : expose les modules natifs Android à la page VéloCompteur.
import { registerPlugin } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { AppLauncher } from '@capacitor/app-launcher';
import { LocalNotifications } from '@capacitor/local-notifications';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');   // GPS qui continue en arrière-plan

window.Native = { BleClient, BackgroundGeolocation, TextToSpeech, Filesystem, Directory, Encoding, Share, AppLauncher, LocalNotifications };
