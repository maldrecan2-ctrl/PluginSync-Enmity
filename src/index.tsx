import { Plugin, registerPlugin, getPlugins } from 'enmity/managers/plugins';
import { getByProps } from 'enmity/metro';
import { React, Toasts, Clipboard } from 'enmity/metro/common';
import { create } from 'enmity/patcher';
import { FormRow, FormSection, TextInput, View } from 'enmity/components';
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
    onStart() {},
    onStop() { Patcher.unpatchAll(); },

    getSettingsPanel({ settings: _ }: { settings: any }) {
        const Panel = () => {
            const [status, setStatus] = React.useState('');
            const [inputs, setInputs] = React.useState<Record<string, string>>({});

            const plugins = getPlugins() ?? [];
            const urls = getUrls();

            // Her plugin için URL kaynağı: 1) manifest.url 2) kaydedilmiş URL
            const getUrl = (p: any): string =>
                p?.url ?? p?.manifest?.url ?? urls[p?.name] ?? '';

            const missing = plugins.filter((p: any) => !getUrl(p));

            const handleSaveUrls = () => {
                const u = getUrls();
                let saved = 0;
                Object.entries(inputs).forEach(([name, url]) => {
                    if (url.trim().startsWith('http')) { u[name] = url.trim(); saved++; }
                });
                setUrls(u);
                setInputs({});
                setStatus(`✓ ${saved} URL kaydedildi`);
                Toasts.open({ content: `${saved} URL kaydedildi!` });
            };

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

            const withUrl = plugins.filter((p: any) => !!getUrl(p)).length;

            return React.createElement(React.Fragment, null,
                React.createElement(FormSection, { title: 'PLUGİN SYNC' },
                    React.createElement(FormRow, {
                        label: `${plugins.length} Plugin · ${withUrl}/${plugins.length} URL Kayıtlı`,
                        subLabel: status || (missing.length > 0
                            ? `${missing.length} plugin için URL gir (bir kez)`
                            : '✓ Hazır — dosyaya kaydet'),
                    })
                ),
                missing.length > 0 ? React.createElement(FormSection, { title: "URL'LERİ GİR (BİR KEZ)" },
                    ...missing.map((p: any) =>
                        React.createElement(View, {
                            key: p.name,
                            style: { paddingHorizontal: 16, paddingVertical: 4 },
                        },
                            React.createElement(TextInput, {
                                value: inputs[p.name] ?? '',
                                onChangeText: (v: string) =>
                                    setInputs((prev: any) => ({ ...prev, [p.name]: v })),
                                placeholder: `${p.name} yükleme URL'si`,
                                placeholderTextColor: '#72767d',
                                style: {
                                    color: '#fff',
                                    backgroundColor: '#2f3136',
                                    borderRadius: 8,
                                    padding: 10,
                                    fontSize: 13,
                                },
                                autoCapitalize: 'none',
                                autoCorrect: false,
                            })
                        )
                    ),
                    React.createElement(FormRow, {
                        label: 'Kaydet',
                        subLabel: "URL'leri kalıcı olarak kaydet",
                        onPress: handleSaveUrls,
                    })
                ) : null,
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
                            key: p.name,
                            label: p.name,
                            subLabel: `v${p.version} · ${getUrl(p) ? '✓ URL kayıtlı' : '✗ URL gir'}`,
                        })
                    )
                )
            );
        };
        return React.createElement(Panel, null);
    },
};

registerPlugin(PluginSync);
