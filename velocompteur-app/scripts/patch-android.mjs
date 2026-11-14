// Ajuste le projet Android généré : permissions (Bluetooth, GPS en arrière-plan, notification), écran toujours allumé.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
let manifest = readFileSync(manifestPath, 'utf8');
const extra = `
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.SEND_SMS" />
    <uses-feature android:name="android.hardware.telephony" android:required="false" />
    <uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />
`;
if (!manifest.includes('FOREGROUND_SERVICE_LOCATION')) {
  manifest = manifest.replace('</manifest>', extra + '</manifest>');
  writeFileSync(manifestPath, manifest);
}
// Retour de l'autorisation Strava : velocompteur://localhost/strava?code=…
if (!manifest.includes('android:scheme="velocompteur"')) {
  const f = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="velocompteur" android:host="localhost" />
            </intent-filter>`;
  const i = manifest.indexOf('</intent-filter>');
  if (i < 0) throw new Error('intent-filter principal introuvable');
  manifest = manifest.slice(0, i + 16) + f + manifest.slice(i + 16);
  writeFileSync(manifestPath, manifest);
}

function findFile(dir, name) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { const r = findFile(p, name); if (r) return r; }
    else if (e === name) return p;
  }
  return null;
}
const main = findFile('android/app/src/main/java', 'MainActivity.java');
if (!main) throw new Error('MainActivity.java introuvable');
const pkg = readFileSync(main, 'utf8').match(/^package\s+([\w.]+);/m)[1];
writeFileSync(main, `package ${pkg};

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmsSendPlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
`);

// Plugin maison : envoi direct d'un SMS (alerte chute)
writeFileSync(join(main, '..', 'SmsSendPlugin.java'), `package ${pkg};

import android.Manifest;
import android.os.Build;
import android.telephony.SmsManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;

@CapacitorPlugin(name = "SmsSend", permissions = { @Permission(strings = { Manifest.permission.SEND_SMS }, alias = "sms") })
public class SmsSendPlugin extends Plugin {
    private boolean granted() { return getPermissionState("sms") == PermissionState.GRANTED; }

    @PluginMethod
    public void requestPerm(PluginCall call) {
        if (granted()) { JSObject r = new JSObject(); r.put("granted", true); call.resolve(r); }
        else requestPermissionForAlias("sms", call, "permOnly");
    }

    @PermissionCallback
    private void permOnly(PluginCall call) { JSObject r = new JSObject(); r.put("granted", granted()); call.resolve(r); }

    @PluginMethod
    public void send(PluginCall call) {
        if (!granted()) { requestPermissionForAlias("sms", call, "permThenSend"); return; }
        doSend(call);
    }

    @PermissionCallback
    private void permThenSend(PluginCall call) { if (granted()) doSend(call); else call.reject("Permission SMS refusée"); }

    private void doSend(PluginCall call) {
        String to = call.getString("to"), text = call.getString("text");
        if (to == null || text == null) { call.reject("numéro ou texte manquant"); return; }
        try {
            SmsManager sm = Build.VERSION.SDK_INT >= 31 ? getContext().getSystemService(SmsManager.class) : SmsManager.getDefault();
            ArrayList<String> parts = sm.divideMessage(text);
            sm.sendMultipartTextMessage(to, null, parts, null, null);
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }
}
`);

// Nom de la notification GPS
const stringsPath = 'android/app/src/main/res/values/strings.xml';
let strings = readFileSync(stringsPath, 'utf8');
if (!strings.includes('capacitor_background_geolocation_notification_channel_name')) {
  strings = strings.replace('</resources>', '    <string name="capacitor_background_geolocation_notification_channel_name">Suivi de la sortie</string>\n</resources>');
  writeFileSync(stringsPath, strings);
}
console.log('Projet Android ajusté');
