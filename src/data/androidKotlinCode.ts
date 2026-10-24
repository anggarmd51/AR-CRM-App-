export interface AndroidCodeFile {
  path: string;
  category: 'manifest' | 'gradle' | 'database' | 'network' | 'repository' | 'worker' | 'ui';
  title: string;
  description: string;
  code: string;
}

export const ANDROID_KOTLIN_PROJECT: AndroidCodeFile[] = [
  {
    path: 'app/src/main/AndroidManifest.xml',
    category: 'manifest',
    title: 'AndroidManifest.xml',
    description: 'Declares Android permissions (Internet, Fine GPS Location, Call/WhatsApp intents) and Application configuration.',
    code: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <!-- Network permissions for AR Cloud Sync Web API -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <!-- GPS Location permissions for Activity Logger Check-Ins -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

    <!-- Telephony & WhatsApp integration queries -->
    <queries>
        <intent>
            <action android:name="android.intent.action.DIAL" />
            <data android:scheme="tel" />
        </intent>
        <package android:name="com.whatsapp" />
    </queries>

    <application
        android:name=".PersonalCrmApp"
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.PersonalCRM"
        tools:targetApi="34">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:windowSoftInputMode="adjustResize"
            android:theme="@style/Theme.PersonalCRM">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

    </application>
</manifest>`,
  },
  {
    path: 'app/build.gradle.kts',
    category: 'gradle',
    title: 'build.gradle.kts (App)',
    description: 'Jetpack Compose, Room SQLite, Retrofit/OkHttp, WorkManager, and Play Services Location dependencies.',
    code: `plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.ksp)
    alias(libs.plugins.hilt.android)
}

android {
    namespace = "com.solocrm.personalcrm"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.solocrm.personalcrm"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "2.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildFeatures {
        compose = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.8"
    }
}

dependencies {
    // Jetpack Compose & Material 3
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.navigation.compose)

    // Room SQLite Database for Offline Caching
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    // Retrofit & OkHttp for AR Cloud Sync REST API
    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.gson)
    implementation(libs.okhttp.logging)

    // WorkManager for Offline-First Background Sync
    implementation(libs.androidx.work.runtime.ktx)

    // Google Play Services Location for GPS Check-In
    implementation(libs.play.services.location)

    // Coroutines & Lifecycle
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
}
`,
  },
  {
    path: 'app/src/main/java/com/solocrm/personalcrm/data/local/LeadEntity.kt',
    category: 'database',
    title: 'Room Entity: LeadEntity.kt',
    description: 'Local Room SQLite database table structure caching leads with sync status flag.',
    code: `package com.solocrm.personalcrm.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "leads")
data class LeadEntity(
    @PrimaryKey
    val id: String, // e.g., "LEAD-101" or local "TEMP-LEAD-xxx"
    val companyName: String,
    val contactPerson: String,
    val phone: String,
    val industry: String,
    val city: String,
    val pipelineStage: String, // "Prospect", "Meeting", "Negotiation", "Closing Won", "Closing Lost"
    val dealValue: Double,
    val nextFollowupDate: String, // "YYYY-MM-DD"
    val leadScore: String, // "Hot", "Warm", "Cold"
    val syncStatus: String = "SYNCED", // "SYNCED", "PENDING_INSERT", "PENDING_UPDATE"
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)`,
  },
  {
    path: 'app/src/main/java/com/solocrm/personalcrm/data/local/ActivityEntity.kt',
    category: 'database',
    title: 'Room Entity: ActivityEntity.kt',
    description: 'Local Room SQLite table for logged activities with GPS coordinates and AI summary.',
    code: `package com.solocrm.personalcrm.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "activities")
data class ActivityEntity(
    @PrimaryKey
    val id: String, // e.g., "ACT-101" or "TEMP-ACT-xxx"
    val leadId: String,
    val activityType: String, // "Meeting Check-In", "Call", "WhatsApp"
    val notes: String,
    val aiSummary: String,
    val locationGps: String, // "latitude, longitude"
    val syncStatus: String = "SYNCED",
    val createdAt: Long = System.currentTimeMillis()
)`,
  },
  {
    path: 'app/src/main/java/com/solocrm/personalcrm/data/local/CrmDao.kt',
    category: 'database',
    title: 'Room DAO: CrmDao.kt',
    description: 'Data Access Object exposing reactive Kotlin Coroutine Flows for offline UI.',
    code: `package com.solocrm.personalcrm.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface CrmDao {
    @Query("SELECT * FROM leads ORDER BY updatedAt DESC")
    fun getAllLeadsFlow(): Flow<List<LeadEntity>>

    @Query("SELECT * FROM leads WHERE id = :leadId LIMIT 1")
    suspend fun getLeadById(leadId: String): LeadEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdateLead(lead: LeadEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLeads(leads: List<LeadEntity>)

    @Query("UPDATE leads SET pipelineStage = :stage, nextFollowupDate = :followupDate, syncStatus = :syncStatus, updatedAt = :updatedAt WHERE id = :leadId")
    suspend fun updateStage(leadId: String, stage: String, followupDate: String, syncStatus: String = "PENDING_UPDATE", updatedAt: Long = System.currentTimeMillis())

    @Query("SELECT * FROM leads WHERE syncStatus != 'SYNCED'")
    suspend fun getPendingLeads(): List<LeadEntity>

    // Activities
    @Query("SELECT * FROM activities WHERE leadId = :leadId ORDER BY createdAt DESC")
    fun getActivitiesForLeadFlow(leadId: String): Flow<List<ActivityEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertActivity(activity: ActivityEntity)

    @Query("SELECT * FROM activities WHERE syncStatus != 'SYNCED'")
    suspend fun getPendingActivities(): List<ActivityEntity>
}`,
  },
  {
    path: 'app/src/main/java/com/solocrm/personalcrm/data/remote/CrmApiService.kt',
    category: 'network',
    title: 'Retrofit API: CrmApiService.kt',
    description: 'Communicates with AR Cloud Sync Web REST API for GET and POST actions.',
    code: `package com.solocrm.personalcrm.data.remote

import com.google.gson.annotations.SerializedName
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface CrmApiService {

    @GET("exec")
    suspend fun getLeads(@Query("action") action: String = "getLeads"): List<RemoteLeadDto>

    @GET("exec")
    suspend fun getActivities(@Query("action") action: String = "getActivities"): List<RemoteActivityDto>

    @GET("exec")
    suspend fun getGlobalLeads(@Query("action") action: String = "getGlobalLeads"): List<RemoteGlobalLeadDto>

    @POST("exec")
    suspend fun addLead(@Body body: AddLeadRequest): Response<ApiResponse>

    @POST("exec")
    suspend fun updateLeadStage(@Body body: UpdateLeadStageRequest): Response<ApiResponse>

    @POST("exec")
    suspend fun addActivity(@Body body: AddActivityRequest): Response<ApiResponse>

    @POST("exec")
    suspend fun importGlobalLead(@Body body: ImportGlobalLeadRequest): Response<ApiResponse>
}

data class AddLeadRequest(
    val action: String = "addLead",
    @SerializedName("company_name") val companyName: String,
    @SerializedName("contact_person") val contactPerson: String,
    val phone: String,
    val industry: String,
    val city: String,
    @SerializedName("pipeline_stage") val pipelineStage: String,
    @SerializedName("deal_value") val dealValue: Double,
    @SerializedName("next_followup_date") val nextFollowupDate: String,
    @SerializedName("lead_score") val leadScore: String
)

data class UpdateLeadStageRequest(
    val action: String = "updateLeadStage",
    val id: String,
    @SerializedName("pipeline_stage") val pipelineStage: String,
    @SerializedName("next_followup_date") val nextFollowupDate: String
)

data class AddActivityRequest(
    val action: String = "addActivity",
    @SerializedName("lead_id") val leadId: String,
    @SerializedName("activity_type") val activityType: String,
    val notes: String,
    @SerializedName("ai_summary") val aiSummary: String,
    @SerializedName("location_gps") val locationGps: String
)

data class ImportGlobalLeadRequest(
    val action: String = "importGlobalLead",
    @SerializedName("company_name") val companyName: String,
    @SerializedName("contact_person") val contactPerson: String,
    val phone: String,
    val industry: String,
    val city: String
)

data class ApiResponse(
    val status: String,
    val id: String? = null,
    val message: String? = null
)`,
  },
  {
    path: 'app/src/main/java/com/solocrm/personalcrm/data/worker/SyncWorker.kt',
    category: 'worker',
    title: 'WorkManager: SyncWorker.kt',
    description: 'Background worker running automated offline sync to Cloud Database when network restores.',
    code: `package com.solocrm.personalcrm.data.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.solocrm.personalcrm.data.local.CrmDao
import com.solocrm.personalcrm.data.remote.CrmApiService
import com.solocrm.personalcrm.data.remote.*

class SyncWorker(
    appContext: Context,
    workerParams: WorkerParameters,
    private val crmDao: CrmDao,
    private val apiService: CrmApiService
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        return try {
            // 1. Flush pending leads
            val pendingLeads = crmDao.getPendingLeads()
            for (lead in pendingLeads) {
                if (lead.syncStatus == "PENDING_INSERT") {
                    val res = apiService.addLead(
                        AddLeadRequest(
                            companyName = lead.companyName,
                            contactPerson = lead.contactPerson,
                            phone = lead.phone,
                            industry = lead.industry,
                            city = lead.city,
                            pipelineStage = lead.pipelineStage,
                            dealValue = lead.dealValue,
                            nextFollowupDate = lead.nextFollowupDate,
                            leadScore = lead.leadScore
                        )
                    )
                    if (res.isSuccessful && res.body()?.status == "success") {
                        val realId = res.body()?.id ?: lead.id
                        crmDao.insertOrUpdateLead(lead.copy(id = realId, syncStatus = "SYNCED"))
                    }
                } else if (lead.syncStatus == "PENDING_UPDATE") {
                    val res = apiService.updateLeadStage(
                        UpdateLeadStageRequest(
                            id = lead.id,
                            pipelineStage = lead.pipelineStage,
                            nextFollowupDate = lead.nextFollowupDate
                        )
                    )
                    if (res.isSuccessful) {
                        crmDao.insertOrUpdateLead(lead.copy(syncStatus = "SYNCED"))
                    }
                }
            }

            // 2. Flush pending activities
            val pendingActs = crmDao.getPendingActivities()
            for (act in pendingActs) {
                val res = apiService.addActivity(
                    AddActivityRequest(
                        leadId = act.leadId,
                        activityType = act.activityType,
                        notes = act.notes,
                        aiSummary = act.aiSummary,
                        locationGps = act.locationGps
                    )
                )
                if (res.isSuccessful) {
                    crmDao.insertActivity(act.copy(syncStatus = "SYNCED"))
                }
            }

            // 3. Pull latest remote updates
            val remoteLeads = apiService.getLeads()
            val entities = remoteLeads.map { it.toEntity() }
            crmDao.insertLeads(entities)

            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}`,
  },
  {
    path: 'app/src/main/java/com/solocrm/personalcrm/ui/screens/PipelineKanbanScreen.kt',
    category: 'ui',
    title: 'Jetpack Compose: PipelineKanbanScreen.kt',
    description: 'Material 3 Kanban pipeline board with tap-to-move stage transitions and WhatsApp/Call actions.',
    code: `package com.solocrm.personalcrm.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.solocrm.personalcrm.data.local.LeadEntity

@Composable
fun PipelineKanbanScreen(
    leads: List<LeadEntity>,
    onStageChange: (leadId: String, newStage: String) -> Unit,
    onLeadClick: (LeadEntity) -> Unit
) {
    val stages = listOf("Prospect", "Meeting", "Negotiation", "Closing Won", "Closing Lost")
    val scrollState = rememberScrollState()

    Row(
        modifier = Modifier
            .fillMaxSize()
            .horizontalScroll(scrollState)
            .padding(8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        stages.forEach { stage ->
            val stageLeads = leads.filter { it.pipelineStage == stage }
            KanbanColumn(
                stageName = stage,
                leads = stageLeads,
                onStageChange = onStageChange,
                onLeadClick = onLeadClick,
                modifier = Modifier.width(300.dp)
            )
        }
    }
}

@Composable
fun KanbanColumn(
    stageName: String,
    leads: List<LeadEntity>,
    onStageChange: (String, String) -> Unit,
    onLeadClick: (LeadEntity) -> Unit,
    modifier: Modifier = Modifier
) {
    val totalValue = leads.sumOf { it.dealValue }

    Card(
        modifier = modifier.fillMaxHeight(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = stageName,
                    style = MaterialTheme.typography.titleMedium
                )
                Badge { Text(leads.size.toString()) }
            }
            Text(
                text = "Rp %,.0f".format(totalValue),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(8.dp))

            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(leads, key = { it.id }) { lead ->
                    LeadCard(lead = lead, onClick = { onLeadClick(lead) })
                }
            }
        }
    }
}`,
  },
];
