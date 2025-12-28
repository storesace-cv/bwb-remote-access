package pt.bwb.provisioner.api

import pt.bwb.provisioner.api.models.ClaimRequest
import pt.bwb.provisioner.api.models.ClaimResponse
import pt.bwb.provisioner.api.models.ProvisionStartRequest
import pt.bwb.provisioner.api.models.ProvisionStartResponse
import pt.bwb.provisioner.api.models.SendRustDeskIdRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

interface ProvisionApi {

    @POST("/api/provision/claim")
    suspend fun claim(
        @Body req: ClaimRequest
    ): Response<ClaimResponse>

    @POST("/api/provision/start")
    suspend fun start(
        @Body req: ProvisionStartRequest
    ): Response<ProvisionStartResponse>

    @POST("/api/provision/rustdesk-id")
    suspend fun sendRustDeskId(
        @Body req: SendRustDeskIdRequest
    ): Response<Unit>
}