import { Plugin, registerPlugin, getPlugins } from 'enmity/managers/plugins';
import { getByProps } from 'enmity/metro';
import { React, Toasts, Clipboard } from 'enmity/metro/common';
import { create } from 'enmity/patcher';
import { FormRow, FormSection } from 'enmity/components';
import manifest from '../manifest.json';

const Patcher = create('PluginSync');

const PluginSync: Plugin = {
    ...manifest,
    onStart() {},
    onStop() { Patcher.unpatchAll(); },

    getSettingsPanel({ settings }: { settings: any }) {
        const Panel = () => {
            const [lastAction, setLastAction] = React.useState('');

            // getPlugins SDK'dan direkt çalışır
            const getAllPlugins = (): any[] => {
                try { return getPlugins() ?? []; }
                catch { return []; }
            };

            // installPlugin window.enmity.plugins üzerinden
            const getInstaller = () => (window as any).enmity?.plugins;

            const saveUrl = (name: string, url: string) => {
                try {
                    const stored = JSON.parse(settings.getString('urls', '{}') || '{}');
                    stored[name] = url;
                    settings.set('urls', JSON.stringify(stored));
                } catch {}
            };

            const installList = (plugins: any[]) => {
                const installer = getInstaller();
                let queued = 0;
                plugins.forEach((p: any) => {
                    const url: string = typeof p === 'string' ? p : p?.url;
                    const name: string = typeof p === 'object' ? (p?.name ?? '') : '';
                    if (!url) return;
                    queued++;
                    try {
                        installer?.installPlugin?.(url, (res: any) => {
                            if ((res?.kind === 'success' || res === true) && name) {
                                saveUrl(name, url);
                            }
                        });
                    } catch {}
                });
                return queued;
            };

            // DIŞA AKTAR — iOS Share sheet
            const handleExport = () => {
                try {
                    const plugins = getAllPlugins();
                    const stored: Record<string, string> = (() => {
                        try { return JSON.parse(settings.getString('urls', '{}') || '{}'); }
                        catch { return {}; }
                    })();

                    const data = JSON.stringify({
                        version: 1,
                        exportedAt: new Date().toISOString(),
                        count: plugins.length,
                        plugins: plugins.map((p: any) => ({
                            name: p.name,
                            version: p.version,
                            url: stored[p.name] || '',
                        })),
                    }, null, 2);

                    const ShareModule = getByProps('share', 'sharedAction');
                    if (ShareModule?.share) {
                        ShareModule.share({ message: data, title: 'PluginSync.json' })
                            .then(() => setLastAction(`${plugins.length} plugin kaydedildi`))
                            .catch(() => {
                                Clipboard.setString(data);
                                setLastAction('Panoya kopyalandı');
                                Toasts.open({ content: 'Panoya kopyalandı!' });
                            });
                    } else {
                        Clipboard.setString(data);
                        setLastAction('Panoya kopyalandı');
                        Toasts.open({ content: 'Panoya kopyalandı!' });
                    }
                } catch {
                    Toasts.open({ content: 'Dışa aktarma hatası!' });
                }
            };

            // İÇE AKTAR — iOS DocumentPicker ile dosya seç
            const handleImport = () => {
                // DocumentPicker modülünü bul
                const DocPicker =
                    getByProps('pickSingle', 'pick') ??
                    getByProps('pick', 'pickDirectory') ??
                    getByProps('DocumentPicker');

                if (DocPicker?.pick || DocPicker?.pickSingle) {
                    const pickFn = DocPicker.pickSingle ?? ((...args: any[]) => DocPicker.pick(...args).then((r: any[]) => r[0]));
                    pickFn({ type: ['public.json', 'public.text', '*/*'] })
                        .then((result: any) => {
                            const uri: string = result?.uri ?? result?.fileCopyUri ?? '';
                            if (!uri) throw new Error('URI yok');
                            return fetch(uri);
                        })
                        .then((res: any) => res.text())
                        .then((text: string) => {
                            const data = JSON.parse(text);
                            if (!Array.isArray(data?.plugins)) {
                                Toasts.open({ content: 'Geçersiz format!' });
                                return;
                            }
                            const count = installList(data.plugins);
                            setLastAction(`${count} plugin yükleniyor...`);
                            Toasts.open({ content: `${count} plugin yükleniyor...` });
                        })
                        .catch((e: any) => {
                            Toasts.open({ content: 'Dosya okunamadı!' });
                        });
                } else {
                    // DocumentPicker yoksa panodan oku
                    Clipboard.getString().then((text: string) => {
                        try {
                            const data = JSON.parse(text);
                            if (!Array.isArray(data?.plugins)) {
                                Toasts.open({ content: 'Geçersiz format!' });
                                return;
                            }
                            const count = installList(data.plugins);
                            setLastAction(`${count} plugin yükleniyor...`);
                            Toasts.open({ content: `${count} plugin yükleniyor...` });
                        } catch {
                            Toasts.open({ content: 'Pano okunamadı!' });
                        }
                    });
                }
            };

            const plugins = getAllPlugins();

            return React.createElement(React.Fragment, null,
                React.createElement(FormSection, { title: 'ÖZET' },
                    React.createElement(FormRow, {
                        label: `${plugins.length} Plugin Yüklü`,
                        subLabel: lastAction || 'Yedek almak için aşağıdaki butona bas',
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
