import { Plugin, registerPlugin } from 'enmity/managers/plugins';
import { getByProps } from 'enmity/metro';
import { React, Toasts, Clipboard } from 'enmity/metro/common';
import { create } from 'enmity/patcher';
import { FormRow, FormSection, Text, View } from 'enmity/components';
import manifest from '../manifest.json';

const Patcher = create('PluginSync');

const PluginSync: Plugin = {
    ...manifest,

    onStart() {},
    onStop() { Patcher.unpatchAll(); },

    getSettingsPanel({ settings }: { settings: any }) {
        // Share API — iOS paylaşım sayfasını açar ("Dosyalara Kaydet" seçeneği dahil)
        const ShareModule = getByProps('share', 'sharedAction');

        const Panel = () => {
            const [lastAction, setLastAction] = React.useState('');
            const enmityPlugins = (window as any).enmity?.plugins;

            // Aktif pluginlerin listesini JSON olarak hazırla
            const buildExportData = (): string => {
                const plugins: any[] = enmityPlugins?.getAllPlugins?.() ?? [];
                const stored: Record<string, string> = (() => {
                    try { return JSON.parse(settings.getString('urls', '{}') || '{}'); }
                    catch { return {}; }
                })();
                return JSON.stringify({
                    version: 1,
                    exportedAt: new Date().toISOString(),
                    plugins: plugins.map((p: any) => ({
                        name: p.name,
                        version: p.version,
                        url: stored[p.name] || '',
                    })),
                }, null, 2);
            };

            // Dışa aktar — iOS Share Sheet ile dosyaya kaydet
            const handleExport = () => {
                try {
                    const data = buildExportData();
                    if (ShareModule?.share) {
                        ShareModule.share({ message: data, title: 'PluginSync Backup' })
                            .then(() => setLastAction('Dışa aktarıldı'))
                            .catch(() => {
                                // Share başarısız → panoya kopyala
                                Clipboard.setString(data);
                                setLastAction('Panoya kopyalandı (Share açılamadı)');
                                Toasts.open({ content: 'Panoya kopyalandı!' });
                            });
                    } else {
                        // Share modülü yok → panoya kopyala
                        Clipboard.setString(data);
                        setLastAction('Panoya kopyalandı');
                        Toasts.open({ content: 'Plugin listesi panoya kopyalandı!' });
                    }
                } catch {
                    Toasts.open({ content: 'Dışa aktarma hatası!' });
                }
            };

            // Plugin URL'ini kaydet
            const saveUrl = (name: string, url: string) => {
                try {
                    const stored = JSON.parse(settings.getString('urls', '{}') || '{}');
                    stored[name] = url;
                    settings.set('urls', JSON.stringify(stored));
                } catch {}
            };

            // İçe aktar — panodan JSON oku ve pluginleri kur
            const handleImport = () => {
                Clipboard.getString().then((text: string) => {
                    try {
                        const data = JSON.parse(text);
                        if (!Array.isArray(data?.plugins)) {
                            Toasts.open({ content: 'Geçersiz format! plugins[] bulunamadı.' });
                            return;
                        }
                        let queued = 0;
                        data.plugins.forEach((p: any) => {
                            const url: string = typeof p === 'string' ? p : p?.url;
                            const name: string = typeof p === 'object' ? (p?.name ?? '') : '';
                            if (!url) return;
                            queued++;
                            try {
                                enmityPlugins?.installPlugin?.(url, (res: any) => {
                                    if ((res?.kind === 'success' || res === true) && name) {
                                        saveUrl(name, url);
                                    }
                                });
                            } catch {}
                        });
                        setLastAction(`${queued} plugin yükleniyor...`);
                        Toasts.open({ content: `${queued} plugin yükleniyor...` });
                    } catch {
                        Toasts.open({ content: 'JSON okunamadı! Dosyadan kopyaladın mı?' });
                    }
                }).catch(() => Toasts.open({ content: 'Pano okunamadı!' }));
            };

            const plugins: any[] = enmityPlugins?.getAllPlugins?.() ?? [];

            return React.createElement(React.Fragment, null,
                // Özet kart
                React.createElement(FormSection, { title: 'ÖZET' },
                    React.createElement(FormRow, {
                        label: `${plugins.length} Plugin Yüklü`,
                        subLabel: lastAction || 'Yedek almak için Dışa Aktar\'a bas',
                    })
                ),

                // Dışa aktar
                React.createElement(FormSection, { title: 'YEDEK AL' },
                    React.createElement(FormRow, {
                        label: 'Dosyaya Kaydet',
                        subLabel: 'iOS paylaşım menüsü açılır → "Dosyalara Kaydet" seç',
                        onPress: handleExport,
                    })
                ),

                // İçe aktar
                React.createElement(FormSection, { title: 'GERİ YÜKLE' },
                    React.createElement(FormRow, {
                        label: 'Dosyadan İçe Aktar',
                        subLabel: 'Dosyayı aç → içeriği kopyala → buraya gel ve bas',
                        onPress: handleImport,
                    })
                ),

                // Yüklü pluginler
                React.createElement(FormSection, { title: `YÜKLÜ PLUGİNLER (${plugins.length})` },
                    ...plugins.map((p: any) =>
                        React.createElement(FormRow, {
                            key: p.name,
                            label: p.name,
                            subLabel: `v${p.version}`,
                        })
                    )
                )
            );
        };

        return React.createElement(Panel, null);
    },
};

registerPlugin(PluginSync);
