import { Plugin, registerPlugin, getPlugins } from 'enmity/managers/plugins';
import { getByProps } from 'enmity/metro';
import { React, Toasts, Clipboard } from 'enmity/metro/common';
import { create } from 'enmity/patcher';
import { FormRow, FormSection } from 'enmity/components';
import { get, set } from 'enmity/api/settings';
import manifest from '../manifest.json';

const Patcher = create('PluginSync');
const PLUGIN_ID = 'PluginSync';

const getStoredUrls = (): Record<string, string> => {
    try { return JSON.parse(get(PLUGIN_ID, 'urls', '{}') || '{}'); }
    catch { return {}; }
};

const setStoredUrls = (data: Record<string, string>) => {
    try { set(PLUGIN_ID, 'urls', JSON.stringify(data)); } catch {}
};

const PluginSync: Plugin = {
    ...manifest,

    onStart() {
        // installPlugin'i hook et — her plugin kurulumunda URL'yi otomatik kaydet
        const enmityPlugins = (window as any).enmity?.plugins;
        if (!enmityPlugins?.installPlugin) return;

        const _orig = enmityPlugins.installPlugin.bind(enmityPlugins);
        enmityPlugins.installPlugin = (url: string, callback: any) => {
            // Kurulum öncesi mevcut plugin isimlerini kaydet
            const before = new Set((enmityPlugins.getPlugins?.() ?? []).map((p: any) => p.name));

            _orig(url, (result: any) => {
                if (result?.kind === 'success') {
                    try {
                        // Yeni yüklenen plugin'i bul
                        const after: any[] = enmityPlugins.getPlugins?.() ?? [];
                        const newPlugin = after.find((p: any) => !before.has(p.name));
                        const name = newPlugin?.name ?? url.split('/').pop()?.replace('.js', '');

                        if (name) {
                            const stored = getStoredUrls();
                            stored[name] = url;
                            setStoredUrls(stored);
                        }
                    } catch {}
                }
                callback?.(result);
            });
        };
    },

    onStop() {
        Patcher.unpatchAll();
        // installPlugin'i geri yükle — Enmity yeniden yükleyeceği için gerekmeyebilir
    },

    getSettingsPanel({ settings: _s }: { settings: any }) {
        const Panel = () => {
            const [lastAction, setLastAction] = React.useState('');

            const installList = (pluginArr: any[]) => {
                const installer = (window as any).enmity?.plugins;
                let queued = 0;
                pluginArr.forEach((p: any) => {
                    const url: string = typeof p === 'string' ? p : p?.url;
                    if (!url) return;
                    queued++;
                    try { installer?.installPlugin?.(url, () => {}); } catch {}
                });
                return queued;
            };

            const handleExport = () => {
                try {
                    const plugins = getPlugins() ?? [];
                    const stored = getStoredUrls();
                    const missingUrls = plugins.filter((p: any) => !stored[p.name]).length;

                    const data = JSON.stringify({
                        version: 1,
                        exportedAt: new Date().toISOString(),
                        count: plugins.length,
                        plugins: plugins.map((p: any) => ({
                            name: p.name,
                            version: p.version,
                            url: stored[p.name] ?? '',
                        })),
                    }, null, 2);

                    const ShareModule = getByProps('share', 'sharedAction');
                    if (ShareModule?.share) {
                        ShareModule.share({ message: data, title: 'PluginSync.json' })
                            .then(() => setLastAction(missingUrls > 0
                                ? `⚠ ${missingUrls} plugin URL'si eksik — önce o pluginleri kaldır/tekrar yükle`
                                : `✓ ${plugins.length} plugin kaydedildi`))
                            .catch(() => { Clipboard.setString(data); Toasts.open({ content: 'Panoya kopyalandı!' }); });
                    } else {
                        Clipboard.setString(data);
                        Toasts.open({ content: 'Panoya kopyalandı!' });
                    }
                } catch { Toasts.open({ content: 'Dışa aktarma hatası!' }); }
            };

            const handleImport = () => {
                const DocPicker = getByProps('pickSingle', 'pick') ?? getByProps('pick', 'pickDirectory');
                if (DocPicker?.pick || DocPicker?.pickSingle) {
                    const pickFn = DocPicker.pickSingle ?? ((...args: any[]) => DocPicker.pick(...args).then((r: any[]) => r[0]));
                    pickFn({ type: ['public.json', 'public.text', '*/*'] })
                        .then((result: any) => fetch(result?.uri ?? result?.fileCopyUri ?? ''))
                        .then((res: any) => res.text())
                        .then((text: string) => {
                            const data = JSON.parse(text);
                            if (!Array.isArray(data?.plugins)) { Toasts.open({ content: 'Geçersiz format!' }); return; }
                            const count = installList(data.plugins);
                            setLastAction(`${count} plugin yükleniyor...`);
                            Toasts.open({ content: `${count} plugin yükleniyor...` });
                        })
                        .catch(() => Toasts.open({ content: 'Dosya okunamadı!' }));
                } else {
                    Clipboard.getString().then((text: string) => {
                        try {
                            const data = JSON.parse(text);
                            if (!Array.isArray(data?.plugins)) { Toasts.open({ content: 'Geçersiz format!' }); return; }
                            const count = installList(data.plugins);
                            setLastAction(`${count} plugin yükleniyor...`);
                            Toasts.open({ content: `${count} plugin yükleniyor...` });
                        } catch { Toasts.open({ content: 'Pano okunamadı!' }); }
                    });
                }
            };

            const plugins = getPlugins() ?? [];
            const stored = getStoredUrls();

            return React.createElement(React.Fragment, null,
                React.createElement(FormSection, { title: 'ÖZET' },
                    React.createElement(FormRow, {
                        label: `${plugins.length} Plugin Yüklü`,
                        subLabel: lastAction || 'Bundan sonra yüklenen pluginler otomatik kaydedilir',
                    })
                ),
                React.createElement(FormSection, { title: 'YEDEK AL' },
                    React.createElement(FormRow, {
                        label: 'Dosyaya Kaydet',
                        subLabel: 'Paylaşım menüsü → "Dosyalara Kaydet"',
                        onPress: handleExport,
                    })
                ),
                React.createElement(FormSection, { title: 'GERİ YÜKLE' },
                    React.createElement(FormRow, {
                        label: 'Dosyadan İçe Aktar',
                        subLabel: 'Dosya seçici açılır → kaydettiğin JSON\'u seç',
                        onPress: handleImport,
                    })
                ),
                React.createElement(FormSection, { title: `YÜKLÜ PLUGİNLER (${plugins.length})` },
                    ...plugins.map((p: any) =>
                        React.createElement(FormRow, {
                            key: p.name,
                            label: p.name,
                            subLabel: stored[p.name] ? `✓ URL kayıtlı` : `✗ URL yok — kaldır ve tekrar yükle`,
                        })
                    )
                )
            );
        };

        return React.createElement(Panel, null);
    },
};

registerPlugin(PluginSync);
