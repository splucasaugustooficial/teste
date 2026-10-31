plugins {
    id("com.android.application")
}

android {
    namespace = "app.snakelivre"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.snakelivre"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }

    sourceSets.getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/webAssets"))
}

tasks.register<Copy>("syncWebAssets") {
    from(rootProject.layout.projectDirectory.dir("../www"))
    into(layout.buildDirectory.dir("generated/webAssets/www"))
    exclude("**/.DS_Store")
}

tasks.configureEach {
    if (name.contains("merge", ignoreCase = true) && name.contains("Assets", ignoreCase = true)) {
        dependsOn("syncWebAssets")
    }
}

tasks.named("preBuild").configure {
    dependsOn("syncWebAssets")
}
