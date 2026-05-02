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
        // Patcher ile installPlugin'i yakala
        const enmityPlugins = (window as any).enmity?.plugins;
        if (!enmityPlugins) return;

        // Object.defineProperty ile güvenilir intercept
        const _orig = enmityPlugins.installPlugin?.bind(enmityPlugins);
        if (!_orig) return;

        Object.defineProperty(enmityPlugins, 'installPlugin', {
            configurable: true,
            value: (url: string, callback: any) => {
                _orig(url, (result: any) => {
                    try {
                        const success = result?.kind === 'success' || result === true || result?.success === true;
                        if (success) {
                            // Dosya adından plugin ismini tahmin et (SecretMessage.js → SecretMessage)
                            const name = url.split('/').pop()?.replace(/\.js$/i, '') ?? '';
                            if (name) {
                                const stored = getStoredUrls();
                                stored[name] = url;
                                setStoredUrls(stored);
                            }
                        }
                    } catch {}
                    callback?.(result);
                });
            }
        });
    },

    onStop() { Patcher.unpatchAll(); },

    getSettingsPanel({ settings: _s }: { settings: any }) {
        const Panel = () => {
            const [lastAction, setLastAction] = React.useState('');
            const [scanning, setScanning] = React.useState(false);

            // RNFS ile Enmity'nin plugin dosyalarını tara — URL'leri bul
            const handleScan = () => {
                setScanning(true);
                try {
                    const RNFS = getByProps('readFile', 'readDir', 'DocumentDirectoryPath');
                    if (!RNFS?.readDir || !RNFS?.DocumentDirectoryPath) {
                        Toasts.open({ content: 'Dosya sistemi erişimi yok!' });
                        setScanning(false);
                        return;
                    }

                    const pluginDir = `${RNFS.DocumentDirectoryPath}/Enmity/plugins`;

                    RNFS.readDir(pluginDir)
                        .then((files: any[]) => {
                            const jsonFiles = files.filter((f: any) => f.name?.endsWith('.json'));
                            const promises = jsonFiles.map((f: any) =>
                                RNFS.readFile(f.path, 'utf8')
                                    .then((content: string) => {
                                        try {
                                            const data = JSON.parse(content);
                                            const name: string = data?.name ?? '';
                                            const url: string = data?.url ?? data?.source ?? data?.sourceUrl ?? '';
                                            if (name && url) return { name, url };
                                        } catch {}
                                        return null;
                                    })
                                    .catch(() => null)
                            );

                            Promise.all(promises).then((results: any[]) => {
                                const stored = getStoredUrls();
                                let found = 0;
                                results.forEach((r: any) => {
                                    if (r?.name && r?.url) {
                                        stored[r.name] = r.url;
                                        found++;
                                    }
                                });
                                setStoredUrls(stored);
                                setLastAction(`${found} URL bulundu`);
                                Toasts.open({ content: `${found} plugin URL'si otomatik bulundu!` });
                                setScanning(false);
                            });
                        })
                        .catch(() => {
                            Toasts.open({ content: 'Plugin dizini okunamadı!' });
                            setScanning(false);
                        });
                } catch {
                    Toasts.open({ content: 'Tarama hatası!' });
                    setScanning(false);
                }
            };

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
                            .then(() => setLastAction(`${plugins.length} plugin kaydedildi`))
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
            const withUrl = plugins.filter((p: any) => stored[p.name]).length;

            return React.createElement(React.Fragment, null,
                React.createElement(FormSection, { title: 'ÖZET' },
                    React.createElement(FormRow, {
                        label: `${plugins.length} Plugin · ${withUrl} URL Kayıtlı`,
                        subLabel: lastAction || 'URL\'leri otomatik bulmak için "Tara"ya bas',
                    })
                ),
                React.createElement(FormSection, { title: 'YEDEK AL' },
                    React.createElement(FormRow, {
                        label: 'URL\'leri Otomatik Tara',
                        subLabel: 'Enmity dosyalarından URL\'leri otomatik bulur',
                        onPress: handleScan,
                    }),
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
                            subLabel: stored[p.name] ? `✓ URL kayıtlı` : `✗ URL bulunamadı`,
                        })
                    )
                )
            );
        };

        return React.createElement(Panel, null);
    },
};

registerPlugin(PluginSync);
