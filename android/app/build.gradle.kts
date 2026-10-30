import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services") apply false
}

// Railway sem push não exige google-services.json de outra marca.
val lojaUseFirebase = (project.findProperty("LOJA_USE_FIREBASE") as String?)?.toBoolean() ?: true
if (lojaUseFirebase) apply(plugin = "com.google.gms.google-services")

val lojaSigningFile = rootProject.file("key.properties")
val lojaSigning = Properties()
if (lojaSigningFile.exists()) lojaSigningFile.inputStream().use { lojaSigning.load(it) }
val lojaRequireSigning = (project.findProperty("LOJA_REQUIRE_RELEASE_SIGNING") as String?)?.toBoolean() ?: false
val lojaSigningReady = listOf("storeFile", "storePassword", "keyAlias", "keyPassword")
    .all { !lojaSigning.getProperty(it).isNullOrBlank() }
if (lojaRequireSigning) {
    require(lojaSigningReady) { "Build de produção exige android/key.properties com assinatura própria." }
    require(file(lojaSigning.getProperty("storeFile")).exists()) { "Arquivo de assinatura não encontrado." }
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    // outras dependências que já existirem...
}

android {
    namespace = "com.loja.roupas.loja_roupas"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = (project.findProperty("LOJA_APPLICATION_ID") as String?) ?: "com.loja.roupas.loja_roupas"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        manifestPlaceholders["lojaAppName"] = (project.findProperty("LOJA_DISPLAY_NAME") as String?) ?: "Loja de Roupas"
    }

    signingConfigs {
        if (lojaSigningReady) {
            create("lojaRelease") {
                storeFile = file(lojaSigning.getProperty("storeFile"))
                storePassword = lojaSigning.getProperty("storePassword")
                keyAlias = lojaSigning.getProperty("keyAlias")
                keyPassword = lojaSigning.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // Builds antigos de demonstração mantêm assinatura debug como alternativa.
            // O helper por cliente exige assinatura própria para produção.
            signingConfig = signingConfigs.getByName(if (lojaSigningReady) "lojaRelease" else "debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
