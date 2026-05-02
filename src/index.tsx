import { Plugin, registerPlugin, getPlugins } from 'enmity/managers/plugins';
import { getByProps } from 'enmity/metro';
import { React, Toasts, Clipboard } from 'enmity/metro/common';
import { create } from 'enmity/patcher';
import { FormRow, FormSection, TextInput, View } from 'enmity/components';
import manifest from '../manifest.json';

const Patcher = create('PluginSync');

const PluginSync: Plugin = {
    ...manifest,
    onStart() {},
    onStop() { Patcher.unpatchAll(); },

    getSettingsPanel({ settings }: { settings: any }) {
        const Panel = () => {
            const [lastAction, setLastAction] = React.useState('');
            const [editMode, setEditMode] = React.useState(false);
            const [urlInputs, setUrlInputs] = React.useState<Record<string, string>>({});

            const getStoredUrls = (): Record<string, string> => {
                try { return JSON.parse(settings.getString('urls', '{}') || '{}'); }
                catch { return {}; }
            };

            const saveUrl = (name: string, url: string) => {
                try {
                    const stored = getStoredUrls();
                    stored[name] = url;
                    settings.set('urls', JSON.stringify(stored));
                } catch {}
            };

            const getInstaller = () => (window as any).enmity?.plugins;

            const installList = (pluginArr: any[]) => {
                const installer = getInstaller();
                let queued = 0;
                pluginArr.forEach((p: any) => {
                    const url: string = typeof p === 'string' ? p : p?.url;
                    const name: string = typeof p === 'object' ? (p?.name ?? '') : '';
                    if (!url) return;
                    queued++;
                    try {
                        installer?.installPlugin?.(url, (res: any) => {
                            if ((res?.kind === 'success' || res === true) && name) saveUrl(name, url);
                        });
                    } catch {}
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
                            .catch(() => { Clipboard.setString(data); setLastAction('Panoya kopyalandı'); Toasts.open({ content: 'Panoya kopyalandı!' }); });
                    } else {
                        Clipboard.setString(data);
                        setLastAction('Panoya kopyalandı');
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

            // URL kaydet tuşu
            const handleSaveUrls = () => {
                Object.entries(urlInputs).forEach(([name, url]) => {
                    if (url.trim()) saveUrl(name, url.trim());
                });
                setEditMode(false);
                setUrlInputs({});
                Toasts.open({ content: 'URL\'ler kaydedildi!' });
                setLastAction('URL\'ler kaydedildi');
            };

            const plugins = getPlugins() ?? [];
            const stored = getStoredUrls();

            return React.createElement(React.Fragment, null,
                React.createElement(FormSection, { title: 'ÖZET' },
                    React.createElement(FormRow, {
                        label: `${plugins.length} Plugin Yüklü`,
                        subLabel: lastAction || 'Pluginlerin URL\'lerini girdikten sonra yedek alın',
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
                // URL yönetimi — her plugin için URL gir
                React.createElement(FormSection, { title: 'PLUGIN URL\'LERİ' },
                    React.createElement(FormRow, {
                        label: editMode ? 'Kaydet' : 'URL\'leri Düzenle',
                        subLabel: editMode ? 'URL\'leri girdikten sonra kaydet' : 'Export\'ta URL\'lerin dolu çıkması için gir',
                        onPress: editMode ? handleSaveUrls : () => setEditMode(true),
                    }),
                    ...plugins.map((p: any) => {
                        const hasUrl = !!(stored[p.name]);
                        if (!editMode) {
                            return React.createElement(FormRow, {
                                key: p.name,
                                label: p.name,
                                subLabel: stored[p.name] ? `✓ URL kayıtlı` : '✗ URL yok — Düzenle\'ye bas',
                            });
                        }
                        return React.createElement(View, { key: p.name, style: { paddingHorizontal: 16, paddingVertical: 4 } },
                            React.createElement(TextInput, {
                                value: urlInputs[p.name] ?? stored[p.name] ?? '',
                                onChangeText: (v: string) => setUrlInputs((prev: any) => ({ ...prev, [p.name]: v })),
                                placeholder: `${p.name} URL'si`,
                                placeholderTextColor: '#72767d',
                                style: { color: '#fff', backgroundColor: '#2f3136', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 4 },
                                autoCapitalize: 'none',
                                autoCorrect: false,
                            })
                        );
                    })
                )
            );
        };

        return React.createElement(Panel, null);
    },
};

registerPlugin(PluginSync);
