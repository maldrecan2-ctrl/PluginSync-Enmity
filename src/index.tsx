import { Plugin, registerPlugin, getPlugins } from 'enmity/managers/plugins';
import { getByProps } from 'enmity/metro';
import { React, Toasts, Clipboard } from 'enmity/metro/common';
import { create } from 'enmity/patcher';
import { FormRow, FormSection, TextInput, View } from 'enmity/components';
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

            const [bulkInput, setBulkInput] = React.useState('');
            const [showBulk, setShowBulk] = React.useState(false);

            // AsyncStorage veya plugin objesinden URL bul
            const handleScan = () => {
                setScanning(true);
                try {
                    // Plugin objesinde gizli URL field'ı var mı kontrol et
                    const plugins = getPlugins() ?? [];
                    const stored = getStoredUrls();
                    let found = 0;
                    plugins.forEach((p: any) => {
                        const url = p?.url ?? p?.source ?? p?.sourceUrl ?? p?.manifest?.url ?? p?._url ?? p?.pluginUrl;
                        if (url && !stored[p.name]) {
                            stored[p.name] = url;
                            found++;
                        }
                    });

                    // AsyncStorage'dan Enmity plugin verisi ara
                    const AsyncStorage = getByProps('getItem', 'setItem', 'getAllKeys');
                    if (AsyncStorage?.getAllKeys) {
                        AsyncStorage.getAllKeys().then((keys: string[]) => {
                            const enmityKeys = keys.filter((k: string) =>
                                k?.toLowerCase?.().includes('plugin') ||
                                k?.toLowerCase?.().includes('enmity')
                            );
                            const reads = enmityKeys.map((k: string) =>
                                AsyncStorage.getItem(k).then((val: string | null) => {
                                    try {
                                        const data = JSON.parse(val ?? '{}');
                                        if (data?.url && data?.name) return { name: data.name, url: data.url };
                                        if (typeof data === 'object') {
                                            // URL pattern içeren string değerleri bul
                                            for (const [key, value] of Object.entries(data)) {
                                                if (typeof value === 'string' && value.startsWith('http')) {
                                                    return { name: key, url: value as string };
                                                }
                                            }
                                        }
                                    } catch {}
                                    return null;
                                }).catch(() => null)
                            );
                            Promise.all(reads).then((results: any[]) => {
                                const fresh = getStoredUrls();
                                results.forEach((r: any) => { if (r?.name && r?.url) { fresh[r.name] = r.url; found++; } });
                                setStoredUrls(fresh);
                                setLastAction(found > 0 ? `${found} URL bulundu` : 'URL bulunamadı — aşağıdan gir');
                                if (found === 0) setShowBulk(true);
                                Toasts.open({ content: found > 0 ? `${found} URL bulundu!` : 'URL bulunamadı, manuel gir' });
                                setScanning(false);
                            });
                        }).catch(() => { setScanning(false); setShowBulk(true); });
                    } else {
                        if (found > 0) setStoredUrls(stored);
                        setLastAction(found > 0 ? `${found} URL bulundu` : 'URL bulunamadı — manuel gir');
                        if (found === 0) setShowBulk(true);
                        Toasts.open({ content: found > 0 ? `${found} URL bulundu!` : 'Manuel giriş gerekiyor' });
                        setScanning(false);
                    }
                } catch { setScanning(false); setShowBulk(true); }
            };

            // Toplu URL kaydet: "PluginAdı=https://..." formatında
            const handleBulkSave = () => {
                const lines = bulkInput.split('\n').map((l: string) => l.trim()).filter(Boolean);
                const stored = getStoredUrls();
                let saved = 0;
                lines.forEach((line: string) => {
                    const eq = line.indexOf('=');
                    if (eq > 0) {
                        const name = line.slice(0, eq).trim();
                        const url = line.slice(eq + 1).trim();
                        if (name && url.startsWith('http')) { stored[name] = url; saved++; }
                    } else if (line.startsWith('http')) {
                        // Sadece URL — dosya adından isim tahmin et
                        const name = line.split('/').pop()?.replace(/\.js$/i, '') ?? '';
                        if (name) { stored[name] = line; saved++; }
                    }
                });
                setStoredUrls(stored);
                setBulkInput('');
                setShowBulk(false);
                setLastAction(`${saved} URL kaydedildi`);
                Toasts.open({ content: `${saved} URL kaydedildi!` });
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
                        subLabel: scanning ? 'Taranıyor...' : 'Plugin objelerinde ve storage\'da URL ara',
                        onPress: handleScan,
                    }),
                    showBulk ? React.createElement(View, { style: { paddingHorizontal: 16, paddingVertical: 8 } },
                        React.createElement(TextInput, {
                            value: bulkInput,
                            onChangeText: setBulkInput,
                            placeholder: 'SecretMessage=https://raw...\nPlatformIndicators=https://raw...',
                            placeholderTextColor: '#72767d',
                            multiline: true,
                            numberOfLines: 4,
                            style: { color: '#fff', backgroundColor: '#2f3136', borderRadius: 8, padding: 10, fontSize: 12, minHeight: 80, marginBottom: 4 },
                            autoCapitalize: 'none',
                            autoCorrect: false,
                        }),
                        React.createElement(FormRow, {
                            label: 'Kaydet',
                            subLabel: 'Her satır: PluginAdı=URL veya sadece URL',
                            onPress: handleBulkSave,
                        })
                    ) : null,
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
