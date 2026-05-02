import { Plugin, registerPlugin } from 'enmity/managers/plugins';
import { getByProps } from 'enmity/metro';
import { React, Toasts, Clipboard } from 'enmity/metro/common';
import { create } from 'enmity/patcher';
import { FormRow, FormSection, TextInput, View } from 'enmity/components';
import manifest from '../manifest.json';

const PluginManager = getByProps('installPlugin', 'removePlugin', 'getPlugin');
const getAllPlugins = (): any[] => {
    try { return PluginManager?.getAllPlugins?.() ?? []; }
    catch { return []; }
};
const installPlugin = (url: string, cb: (res: any) => void) =>
    PluginManager?.installPlugin?.(url, cb);

const Patcher = create('PluginSync');

const STORAGE_KEY = 'PluginSync_urls';

const getStoredUrls = (settings: any): Record<string, string> => {
    try { return JSON.parse(settings.getString(STORAGE_KEY, '{}') || '{}'); }
    catch { return {}; }
};

const saveUrl = (settings: any, name: string, url: string) => {
    const stored = getStoredUrls(settings);
    stored[name] = url;
    settings.set(STORAGE_KEY, JSON.stringify(stored));
};

const processImport = async (data: any, settings: any) => {
    if (!Array.isArray(data?.plugins)) {
        Toasts.open({ content: 'Geçersiz format!' });
        return;
    }
    let ok = 0, fail = 0;
    for (const p of data.plugins) {
        const url: string = typeof p === 'string' ? p : p?.url;
        const name: string = typeof p === 'object' ? p?.name : '';
        if (!url) { fail++; continue; }
        await new Promise<void>(resolve => {
            try {
                installPlugin(url, (res: any) => {
                    if (res?.kind === 'success' || res === true) {
                        ok++;
                        if (name) saveUrl(settings, name, url);
                    } else { fail++; }
                    resolve();
                });
            } catch { fail++; resolve(); }
        });
    }
    Toasts.open({ content: `✓ ${ok} yüklendi${fail ? `, ${fail} başarısız` : ''}` });
};

const SettingsPanel = ({ settings }: { settings: any }) => {
    const [importUrl, setImportUrl] = React.useState('');
    const plugins = getAllPlugins() || [];
    const urls = getStoredUrls(settings);

    const handleExport = () => {
        const data = {
            version: 1,
            plugins: plugins.map((p: any) => ({
                name: p.name,
                version: p.version,
                url: urls[p.name] || '',
            })),
        };
        Clipboard.setString(JSON.stringify(data, null, 2));
        Toasts.open({ content: `${plugins.length} plugin panoya kopyalandı!` });
    };

    const handleImportUrl = async () => {
        if (!importUrl.trim()) { Toasts.open({ content: 'URL boş!' }); return; }
        try {
            const res = await fetch(importUrl.trim());
            const data = await res.json();
            await processImport(data, settings);
        } catch { Toasts.open({ content: 'URL indirilemedi!' }); }
    };

    const handleImportClipboard = async () => {
        try {
            const text = await Clipboard.getString();
            const data = JSON.parse(text);
            await processImport(data, settings);
        } catch { Toasts.open({ content: 'Panodan okunamadı!' }); }
    };

    return React.createElement(React.Fragment, null,
        React.createElement(FormSection, { title: 'DIŞA AKTAR' },
            React.createElement(FormRow, {
                label: 'Panoya Kopyala',
                subLabel: `${plugins.length} plugin JSON formatında kopyalanır`,
                onPress: handleExport,
            })
        ),
        React.createElement(FormSection, { title: 'İÇE AKTAR' },
            React.createElement(View, { style: { paddingHorizontal: 16, paddingVertical: 8 } },
                React.createElement(TextInput, {
                    value: importUrl,
                    onChangeText: setImportUrl,
                    placeholder: 'JSON URL girin (pastebin, gist...)',
                    placeholderTextColor: '#72767d',
                    style: {
                        color: '#fff',
                        backgroundColor: '#2f3136',
                        borderRadius: 8,
                        padding: 10,
                        fontSize: 14,
                    },
                    autoCapitalize: 'none',
                    autoCorrect: false,
                })
            ),
            React.createElement(FormRow, {
                label: "URL'den İçe Aktar",
                subLabel: 'Girdiğiniz URL\'deki plugin listesini yükler',
                onPress: handleImportUrl,
            }),
            React.createElement(FormRow, {
                label: 'Panodan İçe Aktar',
                subLabel: 'Kopyaladığınız JSON\'u doğrudan yapıştırır',
                onPress: handleImportClipboard,
            })
        ),
        React.createElement(FormSection, { title: `YÜKLÜ PLUGİNLER (${plugins.length})` },
            ...plugins.map((p: any) =>
                React.createElement(FormRow, {
                    key: p.name,
                    label: p.name,
                    subLabel: `v${p.version}${urls[p.name] ? '' : ' · URL kaydedilmedi'}`,
                })
            )
        )
    );
};

const PluginSync: Plugin = {
    ...manifest,
    onStart() {},
    onStop() { Patcher.unpatchAll(); },
    getSettingsPanel({ settings }: { settings: any }) {
        return React.createElement(SettingsPanel, { settings });
    },
};

registerPlugin(PluginSync);
