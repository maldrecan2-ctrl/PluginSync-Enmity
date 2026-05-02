import { Plugin, registerPlugin, getPlugins } from 'enmity/managers/plugins';
import { getByProps } from 'enmity/metro';
import { React, Toasts, Clipboard } from 'enmity/metro/common';
import { create } from 'enmity/patcher';
import { FormRow, FormSection } from 'enmity/components';
import { get, set } from 'enmity/api/settings';
import manifest from '../manifest.json';

const Patcher = create('PluginSync');
const ID = 'PluginSync';

const getUrls = (): Record<string, string> => {
    try { return JSON.parse(get(ID, 'urls', '{}') || '{}'); }
    catch { return {}; }
};
const setUrls = (d: Record<string, string>) => {
    try { set(ID, 'urls', JSON.stringify(d)); } catch {}
};

const PluginSync: Plugin = {
    ...manifest,

    onStart() {
        // Yöntem 1: Alert.prompt — Enmity "Plugin URL gir" dialogunu yakala
        const AlertModule = getByProps('prompt', 'alert') ?? getByProps('alert', 'dismiss');
        if (AlertModule?.prompt) {
            Patcher.before(AlertModule, 'prompt', (_self: any, args: any[]) => {
                const origCallback = args[2];
                args[2] = (inputUrl: string) => {
                    if (typeof inputUrl === 'string' && inputUrl.startsWith('http')) {
                        // 3 saniye sonra kontrol et — plugin kurulmuş olur
                        setTimeout(() => {
                            const name = inputUrl.split('/').pop()?.replace(/\.js$/i, '') ?? '';
                            if (name) {
                                const stored = getUrls();
                                stored[name] = inputUrl;
                                setUrls(stored);
                            }
                        }, 3000);
                    }
                    if (typeof origCallback === 'function') origCallback(inputUrl);
                };
            });
        }

        // Yöntem 2: RCTNetworking — React Native'in network modülü
        const Networking = getByProps('sendRequest', 'abortRequest');
        if (Networking?.sendRequest) {
            Patcher.before(Networking, 'sendRequest', (_self: any, args: any[]) => {
                try {
                    const query = args[0];
                    const urlStr: string = query?.url ?? '';
                    if (urlStr.startsWith('http') && urlStr.endsWith('.js')) {
                        // Kaydı gecikmeli yap — response başarılıysa plugin adı eklenecek
                        const name = urlStr.split('/').pop()?.replace(/\.js$/i, '') ?? '';
                        if (name) {
                            setTimeout(() => {
                                const plugins = getPlugins() ?? [];
                                const found = plugins.find((p: any) => p.name === name);
                                if (found) {
                                    const stored = getUrls();
                                    if (!stored[name]) { stored[name] = urlStr; setUrls(stored); }
                                }
                            }, 5000);
                        }
                    }
                } catch {}
            });
        }
    },

    onStop() { Patcher.unpatchAll(); },

    getSettingsPanel({ settings: _ }: { settings: any }) {
        const Panel = () => {
            const [status, setStatus] = React.useState('');
            const [tick, setTick] = React.useState(0);

            const plugins = getPlugins() ?? [];
            const urls = getUrls();
            const getUrl = (p: any): string => p?.url ?? urls[p?.name] ?? '';
            const withUrl = plugins.filter((p: any) => !!getUrl(p)).length;

            const handleSave = () => {
                const data = JSON.stringify({
                    version: 1,
                    savedAt: new Date().toISOString(),
                    plugins: plugins.map((p: any) => ({
                        name: p.name,
                        version: p.version,
                        url: getUrl(p),
                    })),
                }, null, 2);

                const Share = getByProps('share', 'sharedAction');
                if (Share?.share) {
                    Share.share({ message: data, title: 'PluginSync.json' })
                        .then(() => setStatus(`✓ ${plugins.length} plugin kaydedildi`))
                        .catch(() => { Clipboard.setString(data); Toasts.open({ content: 'Panoya kopyalandı!' }); });
                } else {
                    Clipboard.setString(data);
                    Toasts.open({ content: 'Panoya kopyalandı!' });
                }
            };

            const doImport = (text: string) => {
                try {
                    const data = JSON.parse(text);
                    if (!Array.isArray(data?.plugins)) { Toasts.open({ content: 'Geçersiz format!' }); return; }
                    const ep = (window as any).enmity?.plugins;
                    const newUrls = getUrls();
                    let queued = 0, skipped = 0;
                    data.plugins.forEach((p: any) => {
                        const url: string = typeof p === 'string' ? p : p?.url;
                        const name: string = typeof p === 'object' ? (p?.name ?? '') : '';
                        if (!url) { skipped++; return; }
                        queued++;
                        if (name) newUrls[name] = url;
                        try { ep?.installPlugin?.(url, () => {}); } catch {}
                    });
                    setUrls(newUrls);
                    setStatus(`${queued} plugin yükleniyor${skipped > 0 ? ` · ${skipped} atlandı` : ''}`);
                    Toasts.open({ content: `${queued} plugin yükleniyor...` });
                } catch { Toasts.open({ content: 'JSON okunamadı!' }); }
            };

            const handleLoad = () => {
                const DocPicker = getByProps('pickSingle', 'pick') ?? getByProps('pick', 'pickDirectory');
                const pickFn = DocPicker?.pickSingle
                    ?? (DocPicker?.pick ? (...a: any[]) => DocPicker.pick(...a).then((r: any[]) => r[0]) : null);
                if (pickFn) {
                    pickFn({ type: ['public.json', 'public.text', '*/*'] })
                        .then((r: any) => fetch(r?.uri ?? r?.fileCopyUri ?? ''))
                        .then((r: any) => r.text())
                        .then(doImport)
                        .catch(() => Toasts.open({ content: 'Dosya okunamadı!' }));
                } else {
                    Clipboard.getString().then(doImport);
                }
            };

            const handleRefresh = () => {
                setTick(t => t + 1);
                setStatus('Yenilendi');
            };

            return React.createElement(React.Fragment, null,
                React.createElement(FormSection, { title: 'PLUGİN SYNC' },
                    React.createElement(FormRow, {
                        label: `${plugins.length} Plugin · ${withUrl}/${plugins.length} URL Kayıtlı`,
                        subLabel: status || (withUrl < plugins.length
                            ? `${plugins.length - withUrl} plugin URL'si yok — o plugini kaldırıp tekrar yükle`
                            : '✓ Tüm URL\'ler kayıtlı'),
                        onPress: handleRefresh,
                    })
                ),
                React.createElement(FormSection, { title: 'YEDEK AL / GERİ YÜKLE' },
                    React.createElement(FormRow, {
                        label: '📤 Dosyaya Kaydet',
                        subLabel: '"Dosyalara Kaydet" → PluginSync.json olarak sakla',
                        onPress: handleSave,
                    }),
                    React.createElement(FormRow, {
                        label: '📥 Dosyadan Yükle',
                        subLabel: 'Kaydettiğin JSON dosyasını seç → pluginler yüklenir',
                        onPress: handleLoad,
                    })
                ),
                React.createElement(FormSection, { title: `YÜKLÜ PLUGİNLER (${plugins.length})` },
                    ...plugins.map((p: any) =>
                        React.createElement(FormRow, {
                            key: `${p.name}-${tick}`,
                            label: p.name,
                            subLabel: `v${p.version} · ${getUrl(p) ? '✓ URL kayıtlı' : '✗ Kaldırıp tekrar yükle'}`,
                        })
                    )
                )
            );
        };
        return React.createElement(Panel, null);
    },
};

registerPlugin(PluginSync);
