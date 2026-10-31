plugins {
    id("com.android.application")
}

android {
    namespace = "com.neonviper.game"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.neonviper.game"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    lint {
        abortOnError = true
        warningsAsErrors = false
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
