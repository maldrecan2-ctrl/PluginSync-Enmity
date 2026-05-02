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
        // Her plugin kurulumunda URL'yi otomatik kaydet
        const ep = (window as any).enmity?.plugins;
        if (!ep?.installPlugin) return;
        const _orig = ep.installPlugin.bind(ep);
        Object.defineProperty(ep, 'installPlugin', {
            configurable: true,
            value: (url: string, cb: any) => {
                _orig(url, (res: any) => {
                    try {
                        if (res?.kind === 'success' || res === true) {
                            const name = url.split('/').pop()?.replace(/\.js$/i, '') ?? '';
                            if (name) { const u = getUrls(); u[name] = url; setUrls(u); }
                        }
                    } catch {}
                    cb?.(res);
                });
            },
        });
    },

    onStop() { Patcher.unpatchAll(); },

    getSettingsPanel({ settings: _ }: { settings: any }) {
        const Panel = () => {
            const [status, setStatus] = React.useState('');

            const plugins = getPlugins() ?? [];
            const urls = getUrls();

            const buildJson = () => JSON.stringify({
                version: 1,
                savedAt: new Date().toISOString(),
                plugins: plugins.map((p: any) => ({
                    name: p.name,
                    version: p.version,
                    url: urls[p.name] ?? '',
                })),
            }, null, 2);

            // Dosyaya kaydet
            const handleSave = () => {
                const data = buildJson();
                const missing = plugins.filter((p: any) => !urls[p.name]).length;
                const ShareModule = getByProps('share', 'sharedAction');
                if (ShareModule?.share) {
                    ShareModule.share({ message: data, title: 'PluginSync.json' })
                        .then(() => {
                            if (missing > 0) {
                                setStatus(`⚠ ${missing} plugin'in URL'si yok — kaldırıp tekrar yükle`);
                            } else {
                                setStatus(`✓ ${plugins.length} plugin kaydedildi`);
                            }
                        })
                        .catch(() => {
                            Clipboard.setString(data);
                            Toasts.open({ content: 'Panoya kopyalandı!' });
                        });
                } else {
                    Clipboard.setString(data);
                    Toasts.open({ content: 'Panoya kopyalandı!' });
                }
            };

            // Dosyadan yükle
            const handleLoad = () => {
                const DocPicker = getByProps('pickSingle', 'pick') ?? getByProps('pick', 'pickDirectory');
                const pickFn = DocPicker?.pickSingle ?? (DocPicker?.pick
                    ? (...a: any[]) => DocPicker.pick(...a).then((r: any[]) => r[0])
                    : null);

                if (pickFn) {
                    pickFn({ type: ['public.json', 'public.text', '*/*'] })
                        .then((r: any) => fetch(r?.uri ?? r?.fileCopyUri ?? ''))
                        .then((r: any) => r.text())
                        .then((text: string) => processImport(text))
                        .catch(() => Toasts.open({ content: 'Dosya okunamadı!' }));
                } else {
                    // Dosya seçici yok — panodan oku
                    Clipboard.getString().then((text: string) => processImport(text));
                }
            };

            const processImport = (text: string) => {
                try {
                    const data = JSON.parse(text);
                    if (!Array.isArray(data?.plugins)) {
                        Toasts.open({ content: 'Geçersiz format!' });
                        return;
                    }
                    const ep = (window as any).enmity?.plugins;
                    let queued = 0, skipped = 0;
                    data.plugins.forEach((p: any) => {
                        const url: string = typeof p === 'string' ? p : p?.url;
                        if (!url) { skipped++; return; }
                        queued++;
                        try { ep?.installPlugin?.(url, () => {}); } catch {}
                    });
                    setStatus(`${queued} plugin yükleniyor${skipped > 0 ? ` · ${skipped} URL'siz atlandı` : ''}`);
                    Toasts.open({ content: `${queued} plugin yükleniyor...` });
                } catch {
                    Toasts.open({ content: 'JSON okunamadı!' });
                }
            };

            const withUrl = plugins.filter((p: any) => urls[p.name]).length;

            return React.createElement(React.Fragment, null,
                React.createElement(FormSection, { title: 'PLUGİN SYNC' },
                    React.createElement(FormRow, {
                        label: `${plugins.length} Plugin · ${withUrl} URL Kayıtlı`,
                        subLabel: status || 'Pluginleri kaydet veya yükle',
                    })
                ),
                React.createElement(FormSection, { title: 'YEDEK AL' },
                    React.createElement(FormRow, {
                        label: '📤 Dosyaya Kaydet',
                        subLabel: '"Dosyalara Kaydet" → PluginSync.json olarak sakla',
                        onPress: handleSave,
                    })
                ),
                React.createElement(FormSection, { title: 'GERİ YÜKLE' },
                    React.createElement(FormRow, {
                        label: '📥 Dosyadan Yükle',
                        subLabel: 'Kaydettiğin JSON dosyasını seç → pluginler yüklenir',
                        onPress: handleLoad,
                    })
                ),
                React.createElement(FormSection, { title: `YÜKLÜ PLUGİNLER (${plugins.length})` },
                    ...plugins.map((p: any) =>
                        React.createElement(FormRow, {
                            key: p.name,
                            label: p.name,
                            subLabel: `v${p.version} · ${urls[p.name] ? '✓ URL kayıtlı' : '✗ URL yok — kaldırıp tekrar yükle'}`,
                        })
                    )
                )
            );
        };
        return React.createElement(Panel, null);
    },
};

registerPlugin(PluginSync);
