// Empaqueté par esbuild en www/native.js : expose les modules natifs Android à la page VéloCompteur.
import { registerPlugin } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { AppLauncher } from '@capacitor/app-launcher';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');   // GPS qui continue en arrière-plan
const SmsSend = registerPlugin('SmsSend');                               // SMS d'alerte chute (plugin maison, voir patch-android.mjs)

window.Native = { BleClient, BackgroundGeolocation, TextToSpeech, Filesystem, Directory, Encoding, Share, AppLauncher, LocalNotifications, App, SmsSend };
