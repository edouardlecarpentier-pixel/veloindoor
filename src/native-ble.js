// Empaqueté par esbuild en www/native-ble.js : expose le plugin Bluetooth LE à la page web
// et transmet à la page les liens veloindoor://import?d=… envoyés par Vento.
import { BleClient } from '@capacitor-community/bluetooth-le';
import { App } from '@capacitor/app';
window.BleClient = BleClient;

const give = url => { if (window.VI && window.VI.importUrl) window.VI.importUrl(url); };
App.addListener('appUrlOpen', e => give(e.url));                                     // appli déjà ouverte
App.getLaunchUrl().then(r => { if (r && r.url) setTimeout(() => give(r.url), 1500); }).catch(() => {});   // appli lancée par le lien
