package com.ktp.iptv.data.local

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "favorite_lists")
data class FavoriteListEntity(
    @PrimaryKey val id: String,
    val name: String,
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(
    tableName = "favorite_channels",
    primaryKeys = ["listId", "channelId"]
)
data class FavoriteChannelEntity(
    val listId: String,
    val channelId: String,
    val name: String,
    val url: String,
    val logo: String?,
    val countryCode: String,
    val countryName: String,
    val countryFlag: String,
    val category: String,
    val language: String,
    val channelType: String,
    val userAgent: String?,
    val referrer: String?,
    val addedAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "playlist_sources")
data class PlaylistSourceEntity(
    @PrimaryKey val id: String,
    val name: String,
    val kind: String,
    val url: String,
    val username: String? = null,
    val password: String? = null,
    val channelCount: Int = 0,
    val addedAt: Long = System.currentTimeMillis()
)

@Dao
interface IptvDao {
    @Query("SELECT * FROM favorite_lists ORDER BY createdAt ASC")
    fun observeFavoriteLists(): Flow<List<FavoriteListEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFavoriteList(list: FavoriteListEntity)

    @Query("DELETE FROM favorite_lists WHERE id = :listId AND id != 'default'")
    suspend fun deleteFavoriteList(listId: String)

    @Query("SELECT * FROM favorite_channels ORDER BY addedAt DESC")
    fun observeFavoriteChannels(): Flow<List<FavoriteChannelEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFavoriteChannel(channel: FavoriteChannelEntity)

    @Query("DELETE FROM favorite_channels WHERE listId = :listId AND channelId = :channelId")
    suspend fun removeFavoriteChannel(listId: String, channelId: String)

    @Query("DELETE FROM favorite_channels WHERE channelId = :channelId")
    suspend fun removeChannelFromAllFavorites(channelId: String)

    @Query("DELETE FROM favorite_channels WHERE listId = :listId")
    suspend fun clearListChannels(listId: String)

    @Query("SELECT * FROM playlist_sources ORDER BY addedAt DESC")
    fun observeSources(): Flow<List<PlaylistSourceEntity>>

    @Query("SELECT * FROM playlist_sources ORDER BY addedAt DESC")
    suspend fun getAllSourcesOnce(): List<PlaylistSourceEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSource(source: PlaylistSourceEntity)

    @Query("DELETE FROM playlist_sources WHERE id = :sourceId")
    suspend fun deleteSource(sourceId: String)
}

@Database(
    entities = [FavoriteListEntity::class, FavoriteChannelEntity::class, PlaylistSourceEntity::class],
    version = 1,
    exportSchema = false
)
abstract class IptvDatabase : RoomDatabase() {
    abstract fun iptvDao(): IptvDao

    companion object {
        @Volatile
        private var INSTANCE: IptvDatabase? = null

        fun getInstance(context: Context): IptvDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    IptvDatabase::class.java,
                    "ktp_iptv.db"
                ).build().also { INSTANCE = it }
            }
        }
    }
}
