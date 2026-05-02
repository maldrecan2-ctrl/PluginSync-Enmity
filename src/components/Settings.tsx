import { FormRow, FormSwitch } from 'enmity/components';
import { SettingsStore } from 'enmity/api/settings';
import { React } from 'enmity/metro/common';

interface SettingsProps {
   settings: SettingsStore;
}

export default ({ settings }: SettingsProps) => {
   // Menünün kendini yenilemesi için küçük bir state tutuyoruz
   const [renderId, setRenderId] = React.useState(0);

   const handleToggle = (key: string, value: boolean) => {
       if (value) {
           // Biri açıldığında diğerlerini kapat
           settings.set('spoof_desktop', false);
           settings.set('spoof_web', false);
           settings.set('spoof_mobile', false);
           settings.set('spoof_console', false);
           settings.set('spoof_vr', false);
           
           // Tıklananı aç
           settings.set(key, true);
       } else {
           // Kapatılırsa sadece kapat
           settings.set(key, false);
       }
       // Arayüzün güncellenmesini (diğer butonların kapalı gözükmesini) sağla
       setRenderId(renderId + 1);
   };

   // Eğer hiçbiri seçili değilse varsayılan olarak Desktop seçili olsun
   const isDesktop = settings.getBoolean('spoof_desktop', false) || 
      !(settings.getBoolean('spoof_web', false) || settings.getBoolean('spoof_mobile', false) || settings.getBoolean('spoof_console', false) || settings.getBoolean('spoof_vr', false));

   return <>
      <FormRow
         label='Bilgisayar (Desktop)'
         subLabel='Sizi bilgisayardan giriyor gibi gösterir (Varsayılan).'
         trailing={
            <FormSwitch
               value={isDesktop}
               onValueChange={(val: boolean) => handleToggle('spoof_desktop', val)}
            />
         }
      />
      <FormRow
         label='Tarayıcı (Web)'
         subLabel='Sizi Discord Web üzerinden giriyor gibi gösterir.'
         trailing={
            <FormSwitch
               value={settings.getBoolean('spoof_web', false)}
               onValueChange={(val: boolean) => handleToggle('spoof_web', val)}
            />
         }
      />
      <FormRow
         label='Telefon (Mobil)'
         subLabel='Sizi telefondan (iOS/Android) giriyor gibi gösterir.'
         trailing={
            <FormSwitch
               value={settings.getBoolean('spoof_mobile', false)}
               onValueChange={(val: boolean) => handleToggle('spoof_mobile', val)}
            />
         }
      />
      <FormRow
         label='Oyun Konsolu'
         subLabel='Sizi oyun konsolundan (Xbox/Playstation) giriyor gibi gösterir.'
         trailing={
            <FormSwitch
               value={settings.getBoolean('spoof_console', false)}
               onValueChange={(val: boolean) => handleToggle('spoof_console', val)}
            />
         }
      />
      <FormRow
         label='Sanal Gerçeklik (VR)'
         subLabel='Sizi VR (Sanal Gerçeklik) gözlüğünden giriyor gibi gösterir.'
         trailing={
            <FormSwitch
               value={settings.getBoolean('spoof_vr', false)}
               onValueChange={(val: boolean) => handleToggle('spoof_vr', val)}
            />
         }
      />
   </>;
};
