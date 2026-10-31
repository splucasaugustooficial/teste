# APK (entrega isolada)

Somente os **arquivos instaláveis** do Cobra Rede ficam aqui — separados do código-fonte e da pasta de configuração Gradle.

| Arquivo | Uso |
|---------|-----|
| `CobraRede-debug.apk` | Instalação direta (fontes desconhecidas) — gerado pelo script de build |
| `CobraRede-release-unsigned.apk` | Release minificado; **requer assinatura** antes da loja |

## Gerar de novo

Na raiz do projeto `snake-lan/`:

```bash
./scripts/build-apk.sh
```

Não coloque código ou configs nesta pasta; apenas APKs e este README.
