import { Plugin, registerPlugin } from 'enmity/managers/plugins';
import { getByProps } from 'enmity/metro';
import { React, Toasts, Clipboard } from 'enmity/metro/common';
import { create } from 'enmity/patcher';
import { FormRow, FormSection } from 'enmity/components';
import manifest from '../manifest.json';

const Patcher = create('PluginSync');

const PluginSync: Plugin = {
    ...manifest,

    onStart() {},

    onStop() {
        Patcher.unpatchAll();
    },

    getSettingsPanel({ settings }: { settings: any }) {
        const enmityPlugins = (window as any).enmity?.plugins;

        const Panel = () => {
            const [status, setStatus] = React.useState('');

            const handleExport = () => {
                try {
                    const plugins = enmityPlugins?.getAllPlugins?.() ?? [];
                    const stored: Record<string, string> = JSON.parse(
                        settings.getString('urls', '{}') || '{}'
                    );
                    const data = JSON.stringify({
                        version: 1,
                        plugins: plugins.map((p: any) => ({
                            name: p.name,
                            version: p.version,
                            url: stored[p.name] || '',
                        })),
                    });
                    Clipboard.setString(data);
                    setStatus(`✓ ${plugins.length} plugin kopyalandı`);
                    Toasts.open({ content: 'Plugin listesi panoya kopyalandı!' });
                } catch (e) {
                    Toasts.open({ content: 'Dışa aktarma hatası!' });
                }
            };

            const handleImport = () => {
                Clipboard.getString().then((text: string) => {
                    try {
                        const data = JSON.parse(text);
                        if (!Array.isArray(data?.plugins)) {
                            Toasts.open({ content: 'Geçersiz format!' });
                            return;
                        }
                        const InstallManager = (window as any).enmity?.plugins;
                        let queued = 0;
                        data.plugins.forEach((p: any) => {
                            const url: string = typeof p === 'string' ? p : p?.url;
                            const name: string = typeof p === 'object' ? (p?.name ?? '') : '';
                            if (!url) return;
                            queued++;
                            try {
                                InstallManager?.installPlugin?.(url, (res: any) => {
                                    if (res?.kind === 'success' && name) {
                                        const stored = JSON.parse(settings.getString('urls', '{}') || '{}');
                                        stored[name] = url;
                                        settings.set('urls', JSON.stringify(stored));
                                    }
                                });
                            } catch {}
                        });
                        Toasts.open({ content: `${queued} plugin yükleniyor...` });
                        setStatus(`${queued} plugin yükleniyor`);
                    } catch {
                        Toasts.open({ content: 'JSON okunamadı!' });
                    }
                }).catch(() => {
                    Toasts.open({ content: 'Pano okunamadı!' });
                });
            };

            const plugins: any[] = enmityPlugins?.getAllPlugins?.() ?? [];

            return React.createElement(React.Fragment, null,
                React.createElement(FormSection, { title: 'DIŞA AKTAR' },
                    React.createElement(FormRow, {
                        label: 'Panoya Kopyala',
                        subLabel: `${plugins.length} plugin JSON formatında kopyalanır`,
                        onPress: handleExport,
                    })
                ),
                React.createElement(FormSection, { title: 'İÇE AKTAR' },
                    React.createElement(FormRow, {
                        label: 'Panodan İçe Aktar',
                        subLabel: 'Kopyalanan JSON plugin listesini yükler',
                        onPress: handleImport,
                    })
                ),
                status ? React.createElement(FormSection, { title: 'DURUM' },
                    React.createElement(FormRow, { label: status })
                ) : null,
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
