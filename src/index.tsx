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
        // fetch'i yakala — Enmity plugin yüklerken .js dosyasını fetch eder
        const g = global as any;
        const origFetch = g.fetch;
        if (!origFetch) return;

        g.__pluginSyncOrigFetch = origFetch;

        g.fetch = function (url: any, opts?: any) {
            const promise: Promise<any> = origFetch(url, opts);
            const urlStr: string = typeof url === 'string' ? url : (url?.url ?? '');

            if (urlStr.startsWith('http') && urlStr.endsWith('.js')) {
                promise.then((response: any) => {
                    if (!response?.ok) return;
                    response.clone().text().then((text: string) => {
                        // Enmity plugin'i mi? registerPlugin çağrısı var mı?
                        if (text.includes('registerPlugin')) {
                            const name = urlStr.split('/').pop()?.replace(/\.js$/i, '') ?? '';
                            if (name) {
                                const stored = getUrls();
                                if (!stored[name]) {
                                    stored[name] = urlStr;
                                    setUrls(stored);
                                }
                            }
                        }
                    }).catch(() => {});
                }).catch(() => {});
            }

            return promise;
        };
    },

    onStop() {
        // fetch'i geri al
        const g = global as any;
        if (g.__pluginSyncOrigFetch) {
            g.fetch = g.__pluginSyncOrigFetch;
            delete g.__pluginSyncOrigFetch;
        }
        Patcher.unpatchAll();
    },

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
