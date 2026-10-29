# Correção do travamento ao gerar APK Release no Windows

## Diagnóstico
O build foi interrompido com `Gradle build daemon disappeared unexpectedly` e gerou `android/hs_err_pid13288.log`. O trecho do log mostra uma JVM Java 25 iniciada com `-Xmx8G` e `MaxMetaspaceSize=4G`, configurações agressivas para um computador com 8 GB de RAM. A mudança neste pacote reduz os limites e a concorrência. **Não comprova a causa original do crash.**

## Arquivo para substituir
`loja_roupas/android/gradle.properties` (arquivo completo)

Nenhum arquivo precisa ser removido; não muda `settings.gradle`, `build.gradle.kts`, versões do Kotlin, Firebase ou Railway.

## 1. Instalar a alteração
Copie o arquivo de dentro deste ZIP para `loja_roupas/android/gradle.properties`, substituindo o existente.
Feche o Android Studio, o emulador Android e apps pesados para liberar RAM.

## 2. Encerrar o Gradle e limpar a compilação
Na raiz `loja_roupas`, use PowerShell:

```powershell
cd android
.\gradlew.bat --stop
cd ..
flutter clean
flutter pub get
```

## 3. Compilar APK para teste
```powershell
flutter build apk --release `
  --dart-define=LOJA_BACKEND=railway `
  --dart-define=LOJA_API_BASE_URL=https://store-app-production-c741.up.railway.app `
  --dart-define=LOJA_STORE_SLUG=loja-piloto
```

Saída esperada se tiver sucesso: `build\app\outputs\flutter-apk\app-release.apk`.

## 4. Se continuar travando: trocar o Java 25 pelo JDK 21
O Gradle 9.3.1 suporta Java 21 e Java 25. O Java 21 é uma alternativa estável para isolar problema de runtime.

Instale JDK 21 (ex.: Eclipse Temurin 21) e descubra o diretório real do JDK. Então:

```powershell
flutter config --jdk-dir="C:\Program Files\Eclipse Adoptium\jdk-21.0.x.x-hotspot"
flutter doctor -v
cd android
.\gradlew.bat --stop
cd ..
flutter build apk --release `
  --dart-define=LOJA_BACKEND=railway `
  --dart-define=LOJA_API_BASE_URL=https://store-app-production-c741.up.railway.app `
  --dart-define=LOJA_STORE_SLUG=loja-piloto
```

Substitua o caminho de exemplo pelo caminho real; `flutter config --jdk-dir` afeta outros projetos Flutter da sua máquina.

## 5. Se ainda falhar
Não adivinhe: abra `android/hs_err_pid13288.log` e procure pelas primeiras linhas `# A fatal error has been detected`, `#  EXCEPTION_ACCESS_VIOLATION`/`#  Out of Memory Error` e `# Problematic frame`, além de `Native memory allocation`. Envie apenas esse trecho e a saída de `flutter doctor -v` (sem credenciais). O arquivo de crash indica a razão nativa; os avisos Kotlin/AGP no terminal não são, por si, falhas fatais.

## Observações
- O APK de teste usa a assinatura configurada no projeto, que no ZIP é a debug key; isso **não equivale** à configuração de assinatura de publicação na Google Play.
- Não modifique versões AGP/Kotlin neste primeiro teste; trataremos alinhamento de versões com testes específicos quando o build estiver estável.
